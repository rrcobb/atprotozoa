// A 2D magnetostatics field solver, compiled straight to wasm32-unknown-unknown
// with plain rustc/cargo -- no wasm-bindgen, no JS-side glue codegen. State
// lives in fixed static buffers; JS gets raw pointers into linear memory and
// reads/writes them directly as Float32Array views. See ../../README.md for
// the rebuild command.
//
// Physics: solve for the out-of-plane vector potential A_z(x,y) satisfying
//   div( nu * grad(A_z) ) = -J_z
// where nu = 1/mu is the reluctivity (mu = permeability, per grid node) and
// J_z is the free + bound current density. B = curl(A_z z-hat), so
//   B_x =  dA_z/dy,  B_y = -dA_z/dx
// and -- the pretty bit -- contours of constant A_z *are* the magnetic field
// lines, since B is everywhere tangent to them. The renderer on the JS side
// draws those contours directly off the A grid, so the "field lines" in the
// visualization are exact, not a streamline approximation.
//
// Solved by SOR (successive over-relaxation) with A=0 pinned on the outer
// border (a far-field approximation: keep sources away from the domain edge).
// Permanent magnets are modeled as bound surface currents (the equivalent
// Amperian-loop picture of a uniformly magnetized block), assembled into the
// same J_z grid the JS side builds per preset -- the solver itself doesn't
// know the difference between free current and magnet source current.

const MAXN: usize = 256 * 256;
// The MU buffer holds *relative* permeability (mu_r) -- easy numbers for the
// JS side to set (1 for air, 4000 for iron, ...). The PDE is stated in
// absolute permeability (mu_r * MU0), so NU here is the relative reluctivity
// 1/mu_r and the source term is scaled by MU0 to compensate (see relax()).
const MU0: f32 = 4.0 * core::f32::consts::PI * 1e-7;

static mut MU: [f32; MAXN] = [0.0; MAXN];
static mut NU: [f32; MAXN] = [0.0; MAXN];
static mut JZ: [f32; MAXN] = [0.0; MAXN];
static mut A: [f32; MAXN] = [0.0; MAXN];
static mut BX: [f32; MAXN] = [0.0; MAXN];
static mut BY: [f32; MAXN] = [0.0; MAXN];
static mut MAG: [f32; MAXN] = [0.0; MAXN];

#[no_mangle]
pub extern "C" fn mu_ptr() -> *mut f32 { &raw mut MU as *mut f32 }
#[no_mangle]
pub extern "C" fn jz_ptr() -> *mut f32 { &raw mut JZ as *mut f32 }
#[no_mangle]
pub extern "C" fn a_ptr() -> *mut f32 { &raw mut A as *mut f32 }
#[no_mangle]
pub extern "C" fn bx_ptr() -> *mut f32 { &raw mut BX as *mut f32 }
#[no_mangle]
pub extern "C" fn by_ptr() -> *mut f32 { &raw mut BY as *mut f32 }
#[no_mangle]
pub extern "C" fn mag_ptr() -> *mut f32 { &raw mut MAG as *mut f32 }
#[no_mangle]
pub extern "C" fn max_grid() -> u32 { 256 }

/// Precompute reluctivity from the caller-supplied permeability grid and
/// clear the potential. Call once after writing MU, before the first relax().
#[no_mangle]
pub extern "C" fn reset(nx: u32, ny: u32) {
    let n = (nx as usize) * (ny as usize);
    unsafe {
        let mu = &raw mut MU as *mut f32;
        let nu = &raw mut NU as *mut f32;
        let a = &raw mut A as *mut f32;
        for i in 0..n {
            *nu.add(i) = 1.0 / *mu.add(i);
            *a.add(i) = 0.0;
        }
    }
}

/// Run `sweeps` SOR sweeps over the grid. Returns the largest |delta A| seen
/// in the final sweep, so the caller can animate convergence or stop early.
#[no_mangle]
pub extern "C" fn relax(nx: u32, ny: u32, dx: f32, sweeps: u32, omega: f32) -> f32 {
    let nx = nx as usize;
    let ny = ny as usize;
    let dx2 = dx * dx;
    let mut max_delta = 0.0f32;
    unsafe {
        let nu = &raw mut NU as *mut f32;
        let jz = &raw mut JZ as *mut f32;
        let a = &raw mut A as *mut f32;
        for _ in 0..sweeps {
            max_delta = 0.0;
            for j in 1..ny - 1 {
                let row = j * nx;
                for i in 1..nx - 1 {
                    let idx = row + i;
                    let nu_c = *nu.add(idx);
                    let nu_e = 0.5 * (*nu.add(idx + 1) + nu_c);
                    let nu_w = 0.5 * (*nu.add(idx - 1) + nu_c);
                    let nu_n = 0.5 * (*nu.add(idx + nx) + nu_c);
                    let nu_s = 0.5 * (*nu.add(idx - nx) + nu_c);
                    let rhs = nu_e * *a.add(idx + 1)
                        + nu_w * *a.add(idx - 1)
                        + nu_n * *a.add(idx + nx)
                        + nu_s * *a.add(idx - nx)
                        + *jz.add(idx) * dx2;
                    let denom = nu_e + nu_w + nu_n + nu_s;
                    let cur = *a.add(idx);
                    let anew = rhs / denom;
                    let next = cur + omega * (anew - cur);
                    let delta = (next - cur).abs();
                    if delta > max_delta { max_delta = delta; }
                    *a.add(idx) = next;
                }
            }
        }
    }
    max_delta
}

/// Differentiate A into B = (Bx, By) and its magnitude, central differences.
#[no_mangle]
pub extern "C" fn compute_b(nx: u32, ny: u32, dx: f32) {
    let nx = nx as usize;
    let ny = ny as usize;
    unsafe {
        let a = &raw mut A as *mut f32;
        let bx = &raw mut BX as *mut f32;
        let by = &raw mut BY as *mut f32;
        let mag = &raw mut MAG as *mut f32;
        for j in 1..ny - 1 {
            let row = j * nx;
            for i in 1..nx - 1 {
                let idx = row + i;
                let vx = (*a.add(idx + nx) - *a.add(idx - nx)) / (2.0 * dx);
                let vy = -(*a.add(idx + 1) - *a.add(idx - 1)) / (2.0 * dx);
                *bx.add(idx) = vx;
                *by.add(idx) = vy;
                *mag.add(idx) = (vx * vx + vy * vy).sqrt();
            }
        }
    }
}

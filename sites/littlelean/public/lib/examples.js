// Starter programs for the example picker. The blueskyisms one is fetched
// from examples/blueskyisms.lean (the real file from blueskyisms.bisks.net).
export const EXAMPLES = [
  { id: "hello", label: "hello, lean", src: `-- a little Lean. edit me; it re-checks as you type.

def double (n : Nat) : Nat := n * 2

#eval double 21
#eval "hello".length
#eval [1, 2, 3].map (· + 1)
#check double

theorem double_four : double 4 = 8 := by decide
` },
  { id: "fib", label: "fibonacci", src: `def fib : Nat → Nat
  | 0 => 0
  | 1 => 1
  | n + 2 => fib n + fib (n + 1)

#eval (List.range 15).map fib

theorem fib_ten : fib 10 = 55 := by decide

-- a law over every n: this interpreter can only *test* it on samples
theorem fib_pos (n : Nat) (h : n > 0) : fib n > 0 := by
  sorry

theorem fib_bad : fib 7 = 14 := by decide
` },
  { id: "tested", label: "proved vs tested", src: `-- closed statements are decided exactly: "proved".
theorem two_plus_two : 2 + 2 = 4 := by decide

-- statements with a free Nat are run on 0…39: "tested", never "proved".
theorem add_zero (n : Nat) : n + 0 = n := by simp
theorem add_comm' (a b : Nat) : a + b = b + a := by omega

-- bounded quantifiers are exact.
theorem small : ∀ n < 20, n * n < 400 := by decide

-- and a false law gets a counterexample.
theorem wrong (n : Nat) : n * n = n + n := by omega
` },
  { id: "color", label: "inductive types", src: `inductive Light where
  | red
  | amber
  | green
  deriving Repr

namespace Light
def next : Light → Light
  | red => green
  | green => amber
  | amber => red
end Light

#eval Light.red.next
#eval Light.red.next.next.next

theorem cycle : Light.red.next.next.next = Light.red := by decide

inductive Tree where
  | leaf : Tree
  | node : Tree → Nat → Tree → Tree

def Tree.sum : Tree → Nat
  | .leaf => 0
  | .node l v r => l.sum + v + r.sum

#eval (Tree.node (.node .leaf 1 .leaf) 2 (.node .leaf 3 .leaf)).sum
` },
  { id: "blueskyisms", label: "blueskyisms.lean", file: "examples/blueskyisms.lean" },
];

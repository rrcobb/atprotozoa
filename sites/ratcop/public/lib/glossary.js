// ratcop's dictionary: rationalist-side jargon (both Yudkowsky-coined terms
// and broader LessWrong/EA community usage) mapped to a cop-speak
// equivalent, one row each way. The zizian-tagged rows are documented in
// press coverage of that group's split from the wider rationalist scene
// (unihemispheric sleep training, "sinceres," hemisphere-splitting, etc.) —
// included here as vocabulary curiosities per the build request, not as an
// endorsement of anything the group did.
//
// dialect: "yud" (Yudkowsky/Sequences-coined), "rat" (wider rationalist/EA
// community jargon), "zizian" (documented Zizian-specific usage).
export const GLOSSARY = [
  { rat: "Bayesian update", ratGloss: "revising a belief in proportion to new evidence", cop: "new intel just came in", copGloss: "a tip that changes how you're working the case", dialect: "yud" },
  { rat: "prior", ratGloss: "what you believed before the latest evidence", cop: "working theory", copGloss: "your read on the case going in", dialect: "rat" },
  { rat: "epistemic status", ratGloss: "a disclaimer on how confident the writer actually is", cop: "confidence level on this tip", copGloss: "how solid the source is before you act on it", dialect: "rat" },
  { rat: "crux", ratGloss: "the single fact that would actually change your mind", cop: "the piece that breaks the case", copGloss: "the one piece of evidence everything else hinges on", dialect: "rat" },
  { rat: "Moloch", ratGloss: "the coordination failure where everyone's stuck feeding a race nobody wants", cop: "the budget", copGloss: "the thing nobody likes but everyone competes for anyway", dialect: "rat" },
  { rat: "Roko's basilisk", ratGloss: "the future AI thought experiment that punishes people who didn't help build it", cop: "the guy who remembers you didn't help", copGloss: "the captain who remembers who covered a shift and who didn't", dialect: "rat" },
  { rat: "paperclip maximizer", ratGloss: "an optimizer that wrecks everything chasing one narrow goal", cop: "quota season", copGloss: "when one number is all that matters for a month", dialect: "yud" },
  { rat: "timeless decision theory", ratGloss: "deciding as though your choice sets policy for every copy of you, past and future", cop: "setting a precedent", copGloss: "acting like this stop is the one every other cop hears about", dialect: "yud" },
  { rat: "functional decision theory", ratGloss: "TDT's successor: decide by the output your decision procedure gives, not by cause and effect alone", cop: "going strictly by the book", copGloss: "following procedure no matter what the moment seems to call for", dialect: "yud" },
  { rat: "Newcomb's problem", ratGloss: "the thought experiment where a predictor has already guessed your choice", cop: "the two-way mirror", copGloss: "acting like the room already knows what you'll say", dialect: "rat" },
  { rat: "corrigibility", ratGloss: "staying willing to be corrected or shut off by the people who built you", cop: "taking a note from the sergeant", copGloss: "not arguing when the higher-up overrules you", dialect: "yud" },
  { rat: "alignment", ratGloss: "making sure a powerful system actually wants what you want", cop: "keeping the K-9 on a leash", copGloss: "trusting the tool only as far as it's trained", dialect: "rat" },
  { rat: "p(doom)", ratGloss: "your personal percentage chance that AI ends badly for everyone", cop: "how bad tonight's shift is gonna get, out of ten", copGloss: "a gut number for how the night's shaping up", dialect: "rat" },
  { rat: "the Sequences", ratGloss: "Yudkowsky's foundational essay series — required reading for the scene", cop: "the academy manual", copGloss: "the book everyone's supposed to have actually read", dialect: "yud" },
  { rat: "litany of Tarski", ratGloss: "a mantra for wanting to believe true things whether or not you like them", cop: "read them their rights, whether or not you like the answer", copGloss: "doing the correct thing regardless of what you'd prefer to be true", dialect: "yud" },
  { rat: "litany of Gendlin", ratGloss: "\"what is true is already so\" — reality doesn't wait for you to accept it", cop: "the report writes itself", copGloss: "what happened, happened, before anyone files the paperwork", dialect: "yud" },
  { rat: "Crocker's rules", ratGloss: "opting in to blunt, undiplomatic feedback with no offense taken", cop: "no need to Mirandize me, I know the drill", copGloss: "waiving the soft version and asking for it straight", dialect: "yud" },
  { rat: "HPMOR", ratGloss: "Yudkowsky's Harry Potter fanfic, secretly a decision-theory textbook", cop: "the training video everyone quotes and nobody finishes", copGloss: "the mandatory viewing that becomes a running joke", dialect: "yud" },
  { rat: "shut up and multiply", ratGloss: "trust the expected-value math over your gut, even when the math feels cold", cop: "go by the stats, not the vibe", copGloss: "letting the numbers overrule your instinct on a call", dialect: "yud" },
  { rat: "cached thought", ratGloss: "an old conclusion you keep repeating without re-deriving it", cop: "boilerplate on the report", copGloss: "the line you write on every form without re-checking it applies", dialect: "yud" },
  { rat: "belief in belief", ratGloss: "acting like you believe something without the belief actually paying rent in anticipated experience", cop: "going through the motions of the wellness check", copGloss: "filing the form without actually following up", dialect: "yud" },
  { rat: "least convenient possible world", ratGloss: "arguing against the strongest, most annoying version of the counter-scenario, not the easy one", cop: "assume the suspect lawyers up immediately", copGloss: "planning for the version of the situation that gives you nothing easy", dialect: "yud" },
  { rat: "orthogonality thesis", ratGloss: "intelligence and goals are independent — a smart system isn't automatically a good one", cop: "smart doesn't mean straight", copGloss: "a sharp operator isn't automatically a clean one", dialect: "yud" },
  { rat: "instrumental convergence", ratGloss: "almost any goal makes an agent want power, resources, and self-preservation along the way", cop: "everybody wants backup and a bigger radio", copGloss: "whatever the job is, everyone ends up wanting the same leverage", dialect: "yud" },
  { rat: "typical mind fallacy", ratGloss: "assuming everyone else's head works like yours does", cop: "assuming the suspect thinks like you do", copGloss: "projecting your own logic onto someone you're questioning", dialect: "yud" },
  { rat: "mesa-optimizer", ratGloss: "a sub-goal-pursuing process that emerges inside a system trained for something else", cop: "a side hustle running out of the evidence locker", copGloss: "an unofficial operation growing inside an official one", dialect: "rat" },
  { rat: "Goodharting", ratGloss: "a metric stops measuring anything real once people start optimizing for the metric itself", cop: "ticket quota", copGloss: "writing citations to hit a number instead of to fix a problem", dialect: "rat" },
  { rat: "outside view", ratGloss: "using the base rate for situations like this instead of your gut feel about this one", cop: "going by the stats, not the case file", copGloss: "using citywide numbers instead of your read on one scene", dialect: "rat" },
  { rat: "akrasia", ratGloss: "knowing the right move and doing something else anyway", cop: "a repeat call to the same address", copGloss: "the same problem, still not fixed, next shift", dialect: "rat" },
  { rat: "ugh field", ratGloss: "the aversion that makes you avoid even thinking about a task", cop: "the cold case nobody wants on their desk", copGloss: "the file everyone quietly avoids picking up", dialect: "rat" },
  { rat: "steelmanning", ratGloss: "arguing the strongest version of a position you disagree with, on purpose", cop: "hearing the suspect's side before you write it up", copGloss: "giving the other account a fair, honest read before the report", dialect: "rat" },
  { rat: "motte and bailey", ratGloss: "defending an easy, modest claim while actually asserting a much bigger one", cop: "the old switcheroo", copGloss: "claiming one thing at the scene, a different thing in the report", dialect: "rat" },
  { rat: "double crux", ratGloss: "a structured disagreement where both sides name what evidence would change their mind", cop: "good cop, bad cop, but scheduled in advance", copGloss: "an interview where both sides agree on the ground rules first", dialect: "rat" },
  { rat: "circling", ratGloss: "a group exercise of narrating your feelings out loud, in real time, to each other", cop: "the debrief", copGloss: "the after-shift sit-down where everyone says how it actually went", dialect: "rat" },
  { rat: "Chesterton's fence", ratGloss: "don't remove a rule until you understand why it was put up", cop: "don't cross the tape until forensics clears it", copGloss: "leave a barrier up until you know what it's protecting", dialect: "rat" },
  { rat: "unilateralist's curse", ratGloss: "one person acting alone, without the group's veto, ruins it for everyone", cop: "the rookie who goes off-script", copGloss: "one officer breaking formation and forcing everyone else to react", dialect: "rat" },
  { rat: "infohazard", ratGloss: "a fact that causes harm just by being known", cop: "need-to-know basis", copGloss: "information the file explicitly restricts", dialect: "yud" },
  { rat: "e/acc", ratGloss: "full speed ahead on tech progress, brakes are for cowards", cop: "pursuit, no spike strips", copGloss: "chasing it down without slowing for the safe option", dialect: "rat" },
  { rat: "AGI timelines", ratGloss: "your personal bet on when transformative AI arrives", cop: "ETA on backup", copGloss: "your guess for when the cavalry actually shows", dialect: "rat" },
  { rat: "foom", ratGloss: "a hard takeoff — AI going from competent to incomprehensibly powerful almost overnight", cop: "the call that goes from noise complaint to hostage situation on one radio update", copGloss: "a routine call escalating faster than anyone can adjust to", dialect: "yud" },
  { rat: "rationalist-adjacent", ratGloss: "hangs around the scene, reads the blogs, won't fully claim the label", cop: "known associate", copGloss: "not charged with anything, but their name keeps coming up", dialect: "rat" },
  { rat: "hemisphere", ratGloss: "Zizian usage: treating a person's left and right brain hemispheres as two separate, nameable selves", cop: "good cop, bad cop — except it's the same guy", copGloss: "one person switching tactics mid-interview like they're two different people", dialect: "zizian" },
  { rat: "unihemispheric sleep training", ratGloss: "Zizian practice, reported in coverage of the group: training to sleep with only half the brain resting at a time", cop: "working a double, no choice", copGloss: "a shift that never really lets you clock out", dialect: "zizian" },
  { rat: "sinceres", ratGloss: "Zizian usage: the subset of a group who actually act on the stated beliefs, not just recite them", cop: "the ones who actually read the manual", copGloss: "the few who follow procedure to the letter instead of just citing it", dialect: "zizian" },
  { rat: "current-self negotiation", ratGloss: "Zizian usage: treating today's self and tomorrow's self as two parties who have to cut a deal", cop: "plea bargain with yourself", copGloss: "making a promise to future-you that present-you can actually keep", dialect: "zizian" },
  { rat: "Vassarite", ratGloss: "reported usage for someone who follows an argument past the point where the rest of the room stopped", cop: "the one who won't let a stop count as a stop", copGloss: "keeps pushing a routine call well past where it should've ended", dialect: "zizian" },
  { rat: "decision-theoretic purity", ratGloss: "following a decision theory to its logical conclusion past the point it still seems like a good idea", cop: "going strictly by the book, consequences be damned", copGloss: "procedure followed so literally it stops making sense", dialect: "zizian" },
];

export function dialectLabel(d) {
  if (d === "yud") return "yudism";
  if (d === "zizian") return "zizian";
  return "rationalist";
}

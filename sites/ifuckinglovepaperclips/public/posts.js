// Post content for the page. Each post is one of: meme (big colored card),
// photo (caption over a paperclip arrangement), or text (status update).
// 6 posts per page, 8 pages. Page size is a layout choice, not a data cap:
// every post in this file is reachable.
export const POSTS = [
  // page 1
  { k: "meme", bg: "#1877f2", big: "MORE PAPERCLIPS", small: "is not a request. it is a lifestyle.", text: "Say it with me.", likes: 48213, comments: 3102, shares: 19044, t: "2h" },
  { k: "text", text: "Just found a paperclip in a jacket I haven't worn since 2019. Best day of my life. Thank you for coming back to me, little guy. 🥹📎", likes: 9120, comments: 884, shares: 120, t: "3h" },
  { k: "meme", bg: "#f5c518", dark: true, big: "SCIENCE SAYS", small: "a paperclip is just a staple that believes in second chances.", text: "Facts don't care about your feelings. Neither do staples.", likes: 31002, comments: 1204, shares: 8801, t: "5h" },
  { k: "fact", title: "DID YOU KNOW?", body: "The humble paperclip has held more documents together than all the world's armies. Coincidence? Probably. But still. 📎", likes: 22780, comments: 640, shares: 5120, t: "6h" },
  { k: "text", text: "Someone at the office just used a binder clip on a 2-page document. I am not mad. I am just going to stand here very quietly and hold this against the entire department.", likes: 7710, comments: 1411, shares: 302, t: "8h" },
  { k: "meme", bg: "#7a2bd1", big: "CLIPS > EVERYTHING", small: "(except more clips)", text: "Share if you agree. Share if you're already holding one.", likes: 60310, comments: 7880, shares: 40110, t: "9h" },
  // page 2
  { k: "fact", title: "BREAKING", body: "Scientists confirm: 'a little bit bent' is the optimal paperclip state. Straight clips are cowards. Fully unbent clips are chaos. Respect the curve. 📎", likes: 18890, comments: 2201, shares: 4300, t: "11h" },
  { k: "meme", bg: "#0a8f5b", big: "THE FIRST CLIP", small: "was invented by a Norwegian, probably. leave it. we are not fact-checking this page.", text: "Gem clip gang rise up", likes: 15211, comments: 902, shares: 2890, t: "12h" },
  { k: "text", text: "Me: I'll only buy ONE box of paperclips.\nAlso me, at checkout, with 14 boxes, 3 colors, and a tin shaped like a paperclip: 💅", likes: 41820, comments: 2311, shares: 11200, t: "14h" },
  { k: "meme", bg: "#d6336c", big: "COLORED CLIPS", small: "are not a personality. they are a calling.", text: "Pink ones hit different. Fight me in the comments.", likes: 12033, comments: 4890, shares: 1801, t: "16h" },
  { k: "fact", title: "LIFE HACK", body: "Unbend a paperclip to reset your phone. Unbend a paperclip to pick a lock. Unbend a paperclip to feel something. It does everything. 📎📎📎", likes: 52010, comments: 1230, shares: 22411, t: "18h" },
  { k: "text", text: "my wife says 'we need to talk about the paperclips.' I say what about them. she says 'there are four thousand.' I say 'and?' this is why I'm sleeping in the stationery drawer", likes: 33001, comments: 3610, shares: 9022, t: "20h" },
  // page 3
  { k: "meme", bg: "#e8590c", big: "BOSS: ", small: "'we need to cut costs.' me, hugging the paperclip tin: 'not THIS.'", text: "Some things are sacred.", likes: 28733, comments: 1480, shares: 6600, t: "1d" },
  { k: "fact", title: "TRUE STORY", body: "In 1940 Norwegians wore paperclips on their lapels as a quiet act of resistance — a symbol of staying bound together. Respect to the OG clippers. 📎🇳🇴", likes: 89001, comments: 2204, shares: 31120, t: "1d" },
  { k: "text", text: "Be honest. How many paperclips are within arm's reach of you RIGHT NOW? Mine is 11. I counted. Twice. Then I made a chart.", likes: 14320, comments: 9801, shares: 770, t: "1d" },
  { k: "meme", bg: "#212529", big: "LOOP. THE. LOOP.", small: "the double-oval is the superior design. i will not be taking questions.", text: "Gem. Clip. Final answer.", likes: 19010, comments: 3340, shares: 3200, t: "1d" },
  { k: "fact", title: "WHOLESOME", body: "My grandpa kept a single paperclip on his desk for 40 years. When he passed, we found it holding together every receipt for every gift he ever bought us. 😭📎", likes: 142310, comments: 8810, shares: 70200, t: "1d" },
  { k: "meme", bg: "#1098ad", big: "ME AT 3 AM", small: "linking 40 paperclips into a chain that goes nowhere, but oh, it goes SO WELL", text: "No notes.", likes: 36009, comments: 2210, shares: 9100, t: "2d" },
  // page 4
  { k: "text", text: "PSA: a paperclip is not a 'small piece of wire'. It is a small piece of wire THAT HOLDS THINGS TOGETHER. Say that to yourself in the mirror.", likes: 27811, comments: 701, shares: 8012, t: "2d" },
  { k: "meme", bg: "#5f3dc4", big: "CLIPPY", small: "was right. we should have listened.", text: "It looks like you're writing a letter. Would you like help? 📎", likes: 77201, comments: 6602, shares: 33100, t: "2d" },
  { k: "fact", title: "SCIENCE!", body: "A single paperclip contains about 10 centimeters of wire and 100% of my emotional support. Studies show you should carry one everywhere. (Studies: me.)", likes: 16440, comments: 910, shares: 2900, t: "2d" },
  { k: "text", text: "Wanted: one (1) person who understands why I stopped mid-meeting to straighten a paperclip and look at it for ten seconds. Serious inquiries only.", likes: 21500, comments: 1802, shares: 3400, t: "2d" },
  { k: "meme", bg: "#c92a2a", big: "RED CLIP", small: "means 'urgent'. also means 'I like red'. both are valid.", text: "Don't @ me.", likes: 8810, comments: 410, shares: 900, t: "3d" },
  { k: "meme", bg: "#2b8a3e", big: "STAPLES? NO.", small: "staples are for people who've given up on forgiveness", text: "Clips let you change your mind. That's beautiful.", likes: 44000, comments: 3012, shares: 14000, t: "3d" },
  // page 5
  { k: "fact", title: "ALERT", body: "If you've never bent a paperclip into a tiny little heart and given it to someone, call your mother. Then bend one. Then call your mother again. 📎❤️", likes: 63110, comments: 2020, shares: 21800, t: "3d" },
  { k: "text", text: "Hot take: the best desk toy is a single paperclip. The fidget spinner was a distraction from the real thing. The real thing was in the drawer the whole time.", likes: 11450, comments: 1100, shares: 1800, t: "3d" },
  { k: "meme", bg: "#f08c00", dark: true, big: "SHARE IF YOU", small: "have ever unfolded a paperclip during a phone call and felt powerful", text: "I'm in. I'm so in.", likes: 40222, comments: 5901, shares: 28800, t: "4d" },
  { k: "fact", title: "FUN FACT", body: "A paperclip maximizer is a thought experiment about an AI that turns everything into paperclips. Honestly? Kind of a vibe. Not the part about the end of the world. The paperclips part. 📎", likes: 9001, comments: 2402, shares: 1002, t: "4d" },
  { k: "text", text: "I have now spent an hour in the office supply aisle. A man asked if I needed help. I said 'I have never needed help less.' He nodded. He understood.", likes: 25100, comments: 900, shares: 4100, t: "4d" },
  { k: "meme", bg: "#364fc7", big: "ALL CLIPS", small: "are equal. some are just more... bent.", text: "Inclusivity, but for wire.", likes: 18711, comments: 760, shares: 2600, t: "4d" },
  // page 6
  { k: "fact", title: "WARNING", body: "Do NOT leave a paperclip on the floor. Pick it up. Put it on a pedestal. Light a small candle. Walk away. You did a good thing today. 📎🕯️", likes: 20010, comments: 1000, shares: 3500, t: "5d" },
  { k: "meme", bg: "#099268", big: "PAPERCLIP TOWN", small: "population: us. mayor: that one clip stuck to the magnet.", text: "He's a good mayor.", likes: 34004, comments: 4040, shares: 8800, t: "5d" },
  { k: "text", text: "Day 400 of asking my boss for the budget line 'paperclips (aspirational)'. Day 400 of him saying 'no'. Day 400 of me believing.", likes: 56001, comments: 6100, shares: 12010, t: "5d" },
  { k: "meme", bg: "#a61e4d", big: "NO RAGRETS", small: "bought the 10,000 count box. regret nothing. clip everything.", text: "I now have a clip for every occasion and several for no occasion.", likes: 29900, comments: 2100, shares: 5400, t: "5d" },
  { k: "fact", title: "ART HISTORY", body: "Da Vinci never drew a paperclip. Think about that. Now think about what he could have clipped. The Mona Lisa's receipt, for one. 🎨📎", likes: 12100, comments: 880, shares: 1900, t: "6d" },
  { k: "text", text: "To the person who borrowed a paperclip in 2021 and didn't give it back: I'm not angry. I'm just going to remember it for the rest of my life.", likes: 38020, comments: 3500, shares: 6900, t: "6d" },
  // page 7
  { k: "meme", bg: "#0b7285", big: "THE CLIPPENING", small: "is coming and I, for one, welcome our new tiny wire overlords", text: "(Please keep them away from the staple remover.)", likes: 71110, comments: 9200, shares: 40400, t: "6d" },
  { k: "fact", title: "STRETCH", body: "You can unbend a paperclip into a 10-inch wire. You can ALSO bend it back into a paperclip. That's called growth, and we love to see it. 📎", likes: 17900, comments: 400, shares: 3000, t: "6d" },
  { k: "text", text: "I ranked all the office supplies. Paperclips are 1 through 9. Pens are 10. Everything else is a draft.", likes: 24100, comments: 5000, shares: 4200, t: "1w" },
  { k: "meme", bg: "#862e9c", big: "LIKE IF YOU", small: "straighten a clip, bend it back, and call it 'good enough' every time", text: "Same.", likes: 51200, comments: 2800, shares: 17000, t: "1w" },
  { k: "fact", title: "FOR YOUR INFO", body: "A single paperclip, held at the right angle, can hold together a marriage, a mortgage, and a sheaf of tax forms. That's called infrastructure. 📎", likes: 33333, comments: 1200, shares: 12100, t: "1w" },
  { k: "text", text: "Today I let a coworker use my paperclip. We've been through so much together. I hope it knows I'll always be here. The clip, I mean. The coworker has left the company.", likes: 19050, comments: 880, shares: 2200, t: "1w" },
  // page 8
  { k: "meme", bg: "#1877f2", big: "THANK YOU", small: "for being part of the one true clip community. 📎", text: "We are 4.2 million strong and we all have drawers full of these.", likes: 98000, comments: 5100, shares: 31000, t: "1w" },
  { k: "fact", title: "END OF PAGE", body: "If you have reached this part of the page you have a problem. We love you. Go find a paperclip. 📎", likes: 66666, comments: 2900, shares: 19100, t: "1w" },
  { k: "text", text: "Moderator note: admins will not be taking questions about 'how many paperclips is too many'. The answer is not a number. The answer is a feeling.", likes: 10100, comments: 600, shares: 700, t: "2w" },
  { k: "meme", bg: "#212529", big: "ONE MORE CLIP", small: "(there is always one more clip)", text: "Goodnight, everybody. Bend gently. 📎", likes: 54001, comments: 3300, shares: 8800, t: "2w" },
  { k: "text", text: "Reminder that the 'infinite scroll' in your life is a bowl of paperclips and you can just... put your hand in it. Anytime. For free.", likes: 29990, comments: 2020, shares: 5050, t: "2w" },
  { k: "meme", bg: "#2f9e44", big: "SEE YOU AT PAGE 1", small: "it's paperclips all the way down", text: "↻", likes: 33000, comments: 1000, shares: 9000, t: "2w" },
];
export const PER_PAGE = 6;

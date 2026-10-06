// Individual stories, essays, lectures and poems, each with the collections it
// appears in. Built from one list per collection: add(collection, year, kind, [[spanish, english?], ...]).
// A piece's year is the year of the earliest collection listed here, not
// necessarily its first magazine printing. Selective, from memory, not
// exhaustive; the big essay and poetry books are sampled, the story books are
// close to complete. `collection` strings must match a title in works.js.
const byTitle = new Map();
function add(collection, year, kind, list) {
  for (const [t, en] of list) {
    let p = byTitle.get(t);
    if (!p) { p = { t, en: en || "", kind, y: year, in: [] }; byTitle.set(t, p); }
    if (!p.en && en) p.en = en;
    p.y = Math.min(p.y, year);
    if (!p.in.includes(collection)) p.in.push(collection);
  }
}

add("Fervor de Buenos Aires", 1923, "poem", [
  ["Calle desconocida", "Unknown Street"], ["La Recoleta"], ["Amanecer", "Dawn"],
]);
add("Discusión", 1932, "essay", [
  ["El arte narrativo y la magia", "Narrative Art and Magic"],
  ["La supersticiosa ética del lector", "The Superstitious Ethics of the Reader"],
  ["El otro Whitman", "The Other Whitman"],
  ["Una vindicación de la cábala", "A Vindication of the Kabbalah"],
  ["Una vindicación del falso Basílides", "A Vindication of the False Basilides"],
  ["La perpetua carrera de Aquiles y la tortuga", "The Perpetual Race of Achilles and the Tortoise"],
  ["Las versiones homéricas", "The Homeric Versions"],
]);
add("Historia universal de la infamia", 1935, "fiction", [
  ["El atroz redentor Lazarus Morell", "The Cruel Redeemer Lazarus Morell"],
  ["El impostor inverosímil Tom Castro", "The Improbable Impostor Tom Castro"],
  ["La viuda Ching, pirata", "The Widow Ching, Pirate"],
  ["El proveedor de iniquidades Monk Eastman", "Monk Eastman, Purveyor of Iniquities"],
  ["El asesino desinteresado Bill Harrigan", "The Disinterested Killer Bill Harrigan"],
  ["El incivil maestro de ceremonias Kotsuké no Suké", "The Uncivil Teacher of Court Etiquette Kotsuké no Suké"],
  ["El tintorero enmascarado Hákim de Merv", "The Masked Dyer, Hakim of Merv"],
  ["Hombre de la esquina rosada", "Man on Pink Corner"],
]);
add("Historia de la eternidad", 1936, "essay", [
  ["Historia de la eternidad", "A History of Eternity"],
  ["Las kenningar", "The Kenningar"],
  ["La metáfora", "The Metaphor"],
  ["El tiempo circular", "Circular Time"],
  ["Los traductores de las 1001 noches", "The Translators of The Thousand and One Nights"],
]);
const jardin = [
  ["Tlön, Uqbar, Orbis Tertius"],
  ["El acercamiento a Almotásim", "The Approach to Al-Mu'tasim"],
  ["Pierre Menard, autor del Quijote", "Pierre Menard, Author of the Quixote"],
  ["Las ruinas circulares", "The Circular Ruins"],
  ["La lotería en Babilonia", "The Lottery in Babylon"],
  ["Examen de la obra de Herbert Quain", "An Examination of the Work of Herbert Quain"],
  ["La biblioteca de Babel", "The Library of Babel"],
  ["El jardín de senderos que se bifurcan", "The Garden of Forking Paths"],
];
add("El jardín de senderos que se bifurcan", 1941, "fiction", jardin);
add("Ficciones", 1944, "fiction", jardin);
add("Ficciones", 1944, "fiction", [
  ["Funes el memorioso", "Funes, His Memory"],
  ["La forma de la espada", "The Form of the Sword"],
  ["Tema del traidor y del héroe", "Theme of the Traitor and the Hero"],
  ["La muerte y la brújula", "Death and the Compass"],
  ["El milagro secreto", "The Secret Miracle"],
  ["Tres versiones de Judas", "Three Versions of Judas"],
  ["El fin", "The End"],
  ["La secta del Fénix", "The Sect of the Phoenix"],
  ["El Sur", "The South"],
]);
add("Antología de la literatura fantástica", 1940, "essay", [
  ["Prólogo a la Antología de la literatura fantástica", "Preface to the anthology (with Bioy Casares and Ocampo)"],
]);
add("El Aleph", 1949, "fiction", [
  ["El inmortal", "The Immortal"], ["El muerto", "The Dead Man"], ["Los teólogos", "The Theologians"],
  ["Historia del guerrero y de la cautiva", "Story of the Warrior and the Captive"],
  ["Biografía de Tadeo Isidoro Cruz (1829–1874)", "Biography of Tadeo Isidoro Cruz"],
  ["Emma Zunz"], ["La casa de Asterión", "The House of Asterion"], ["La otra muerte", "The Other Death"],
  ["Deutsches Requiem"], ["La busca de Averroes", "Averroes's Search"], ["El Zahir", "The Zahir"],
  ["La escritura del Dios", "The Writing of the God"], ["Abenjacán el Bojarí, muerto en su laberinto", "Ibn-Hakkan al-Bokhari, Dead in His Labyrinth"],
  ["Los dos reyes y los dos laberintos", "The Two Kings and the Two Labyrinths"], ["La espera", "The Wait"],
  ["El hombre en el umbral", "The Man on the Threshold"], ["El Aleph", "The Aleph"],
]);
add("Otras inquisiciones", 1952, "essay", [
  ["La muralla y los libros", "The Wall and the Books"],
  ["La esfera de Pascal", "Pascal's Sphere"],
  ["El sueño de Coleridge", "Coleridge's Dream"],
  ["Kafka y sus precursores", "Kafka and His Precursors"],
  ["El idioma analítico de John Wilkins", "The Analytical Language of John Wilkins"],
  ["Nathaniel Hawthorne"],
  ["Valéry como símbolo", "Valéry as Symbol"],
  ["Del culto de los libros", "On the Cult of Books"],
  ["El enigma de Edward FitzGerald", "The Enigma of Edward FitzGerald"],
  ["Flaubert y su ejemplar destino", "Flaubert and His Exemplary Destiny"],
  ["Magias parciales del Quijote", "Partial Magic in the Quixote"],
  ["Avatares de la tortuga", "Avatars of the Tortoise"],
  ["Nueva refutación del tiempo", "A New Refutation of Time"],
]);
add("El hacedor", 1960, "poem", [
  ["Poema de los dones", "Poem of the Gifts"], ["Arte poética", "Ars Poetica"], ["Ajedrez", "Chess"],
]);
add("El hacedor", 1960, "fiction", [
  ["Borges y yo", "Borges and I"], ["El hacedor", "The Maker"], ["Everything and Nothing"],
  ["Del rigor en la ciencia", "On Exactitude in Science"], ["Los espejos velados", "The Draped Mirrors"],
  ["Parábola del palacio", "Parable of the Palace"], ["Ragnarök"], ["Paradiso, XXXI, 108"],
]);
add("El otro, el mismo", 1964, "poem", [
  ["Poema conjetural", "Conjectural Poem"], ["El golem", "The Golem"], ["Spinoza"], ["Everness"],
]);
add("Para las seis cuerdas", 1965, "poem", [["Milonga de dos hermanos"], ["Alguien le dice al tango"]]);
add("Elogio de la sombra", 1969, "poem", [["Elogio de la sombra", "In Praise of Darkness"]]);
add("El informe de Brodie", 1970, "fiction", [
  ["El informe de Brodie", "Doctor Brodie's Report"], ["El Evangelio según Marcos", "The Gospel According to Mark"],
  ["Guayaquil"], ["La intrusa", "The Intruder"], ["El indigno", "The Unworthy Friend"],
  ["Historia de Rosendo Juárez", "The Story from Rosendo Juárez"], ["Juan Muraña"], ["El encuentro", "The Encounter"],
  ["Los duelistas", "The Duelists"], ["El otro duelo", "The Other Duel"],
]);
add("El libro de arena", 1975, "fiction", [
  ["El otro", "The Other"], ["Ulrica"], ["El Congreso", "The Congress"], ["There Are More Things"],
  ["La secta de los treinta", "The Sect of the Thirty"], ["La noche de los dones", "The Night of the Gifts"],
  ["El espejo y la máscara", "The Mirror and the Mask"], ["Undr"],
  ["Utopía de un hombre que está cansado", "Utopia of a Tired Man"], ["El soborno", "The Bribe"],
  ["Avelino Arredondo"], ["El disco", "The Disk"], ["El libro de arena", "The Book of Sand"],
]);
add("Siete noches", 1980, "lecture", [
  ["La Divina Comedia", "The Divine Comedy"], ["La pesadilla", "Nightmares"],
  ["Las mil y una noches", "The Thousand and One Nights"], ["El budismo", "Buddhism"],
  ["La poesía", "Poetry"], ["La cábala", "The Kabbalah"], ["La ceguera", "Blindness"],
]);
add("La memoria de Shakespeare", 1983, "fiction", [
  ["La memoria de Shakespeare", "Shakespeare's Memory"], ["Tigres azules", "Blue Tigers"],
  ["Rosa de Paracelso", "Paracelsus's Rose"], ["Veinticinco de agosto, 1983", "August 25, 1983"],
]);
add("Los conjurados", 1985, "poem", [["Los conjurados", "The Conspirators"]]);

// Hurley's 1998 Collected Fictions gathers every story above except the
// pieces tagged as essays, lectures or poems.
export const COLLECTED = "Collected Fictions (Hurley, 1998)";
// Labyrinths (1962, Yates and Irby): the pieces I'm confident are in it.
export const LABYRINTHS = "Labyrinths (1962)";
const inLabyrinths = new Set([
  "Tlön, Uqbar, Orbis Tertius", "El acercamiento a Almotásim", "Pierre Menard, autor del Quijote",
  "Las ruinas circulares", "La lotería en Babilonia", "Examen de la obra de Herbert Quain", "La biblioteca de Babel",
  "El jardín de senderos que se bifurcan", "Funes el memorioso", "La forma de la espada",
  "Tema del traidor y del héroe", "La muerte y la brújula", "El milagro secreto", "Tres versiones de Judas",
  "La secta del Fénix", "El Sur", "El inmortal", "Los teólogos", "La casa de Asterión", "La busca de Averroes",
  "La escritura del Dios", "Abenjacán el Bojarí, muerto en su laberinto", "Los dos reyes y los dos laberintos",
  "El hombre en el umbral", "El Aleph", "Del rigor en la ciencia", "Borges y yo",
  "La muralla y los libros", "La esfera de Pascal", "El sueño de Coleridge", "Kafka y sus precursores",
  "El idioma analítico de John Wilkins", "Nathaniel Hawthorne", "Valéry como símbolo", "Avatares de la tortuga",
  "Nueva refutación del tiempo", "Magias parciales del Quijote", "Del culto de los libros",
]);

export const PIECES = [...byTitle.values()].map((p) => {
  if (p.kind === "fiction") p.in.push(COLLECTED);
  if (inLabyrinths.has(p.t)) p.in.push(LABYRINTHS);
  return p;
});

export const PIECE_KINDS = [
  ["all", "all"], ["fiction", "stories"], ["essay", "essays"], ["lecture", "lectures"], ["poem", "poems"],
];

// Every collection a piece appears in, in the order the dropdown lists them.
export const COLLECTIONS = [...new Set(PIECES.flatMap((p) => p.in))].sort((a, b) => a.localeCompare(b, "es"));

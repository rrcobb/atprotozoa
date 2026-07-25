// life.js — hash every Bluesky DID to a fixed leaf in a real taxonomy, and
// build the people-you-know version of that tree.
//
// The species table below is fixed (kingdom → phylum → class → order →
// family → genus → species, ~120 real organisms). A DID's species is
// `SPECIES[hash32(did) % SPECIES.length]` — a pure function of the DID
// string and the (never-reordered) table, so it's the same species for
// everyone, forever, with no lookup and no server: your assignment doesn't
// depend on who's asking, only on your DID. That's what "globally stable"
// means here — reshuffling or resizing SPECIES would be the one thing that
// changes it, so we don't.
//
// Network-building (resolveDid, graphAll, the mutuals/widen logic) is copied
// from neighborhood/public/lib/hood.js — copy, don't abstract.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned for mutuals
const MIN_POOL = 8; // below this, widen mutuals → follows so the tree isn't bare

// ---- hashing (FNV-1a, copied from mootdrone/public/lib/synth.js) ----------

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---- the species table -----------------------------------------------------
// [common name, binomial, kingdom, phylum, class, order, family, genus]

const RAW_SPECIES = [
  ["Red Fox", "Vulpes vulpes", "Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Vulpes"],
  ["Gray Wolf", "Canis lupus", "Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Canis"],
  ["Coyote", "Canis latrans", "Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Canis"],
  ["Lion", "Panthera leo", "Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Panthera"],
  ["Tiger", "Panthera tigris", "Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Panthera"],
  ["Domestic Cat", "Felis catus", "Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Felis"],
  ["Cheetah", "Acinonyx jubatus", "Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Acinonyx"],
  ["Eurasian Lynx", "Lynx lynx", "Animalia", "Chordata", "Mammalia", "Carnivora", "Felidae", "Lynx"],
  ["Brown Bear", "Ursus arctos", "Animalia", "Chordata", "Mammalia", "Carnivora", "Ursidae", "Ursus"],
  ["Polar Bear", "Ursus maritimus", "Animalia", "Chordata", "Mammalia", "Carnivora", "Ursidae", "Ursus"],
  ["Giant Panda", "Ailuropoda melanoleuca", "Animalia", "Chordata", "Mammalia", "Carnivora", "Ursidae", "Ailuropoda"],
  ["Eurasian Otter", "Lutra lutra", "Animalia", "Chordata", "Mammalia", "Carnivora", "Mustelidae", "Lutra"],
  ["Stoat", "Mustela erminea", "Animalia", "Chordata", "Mammalia", "Carnivora", "Mustelidae", "Mustela"],
  ["Raccoon", "Procyon lotor", "Animalia", "Chordata", "Mammalia", "Carnivora", "Procyonidae", "Procyon"],
  ["Spotted Hyena", "Crocuta crocuta", "Animalia", "Chordata", "Mammalia", "Carnivora", "Hyaenidae", "Crocuta"],
  ["Chimpanzee", "Pan troglodytes", "Animalia", "Chordata", "Mammalia", "Primates", "Hominidae", "Pan"],
  ["Western Gorilla", "Gorilla gorilla", "Animalia", "Chordata", "Mammalia", "Primates", "Hominidae", "Gorilla"],
  ["Bornean Orangutan", "Pongo pygmaeus", "Animalia", "Chordata", "Mammalia", "Primates", "Hominidae", "Pongo"],
  ["Human", "Homo sapiens", "Animalia", "Chordata", "Mammalia", "Primates", "Hominidae", "Homo"],
  ["Rhesus Macaque", "Macaca mulatta", "Animalia", "Chordata", "Mammalia", "Primates", "Cercopithecidae", "Macaca"],
  ["Olive Baboon", "Papio anubis", "Animalia", "Chordata", "Mammalia", "Primates", "Cercopithecidae", "Papio"],
  ["Ring-tailed Lemur", "Lemur catta", "Animalia", "Chordata", "Mammalia", "Primates", "Lemuridae", "Lemur"],
  ["Eastern Gray Squirrel", "Sciurus carolinensis", "Animalia", "Chordata", "Mammalia", "Rodentia", "Sciuridae", "Sciurus"],
  ["Groundhog", "Marmota monax", "Animalia", "Chordata", "Mammalia", "Rodentia", "Sciuridae", "Marmota"],
  ["House Mouse", "Mus musculus", "Animalia", "Chordata", "Mammalia", "Rodentia", "Muridae", "Mus"],
  ["Brown Rat", "Rattus norvegicus", "Animalia", "Chordata", "Mammalia", "Rodentia", "Muridae", "Rattus"],
  ["North American Beaver", "Castor canadensis", "Animalia", "Chordata", "Mammalia", "Rodentia", "Castoridae", "Castor"],
  ["North American Porcupine", "Erethizon dorsatum", "Animalia", "Chordata", "Mammalia", "Rodentia", "Erethizontidae", "Erethizon"],
  ["Blue Whale", "Balaenoptera musculus", "Animalia", "Chordata", "Mammalia", "Cetacea", "Balaenopteridae", "Balaenoptera"],
  ["Humpback Whale", "Megaptera novaeangliae", "Animalia", "Chordata", "Mammalia", "Cetacea", "Balaenopteridae", "Megaptera"],
  ["Orca", "Orcinus orca", "Animalia", "Chordata", "Mammalia", "Cetacea", "Delphinidae", "Orcinus"],
  ["Bottlenose Dolphin", "Tursiops truncatus", "Animalia", "Chordata", "Mammalia", "Cetacea", "Delphinidae", "Tursiops"],
  ["Little Brown Bat", "Myotis lucifugus", "Animalia", "Chordata", "Mammalia", "Chiroptera", "Vespertilionidae", "Myotis"],
  ["Large Flying Fox", "Pteropus vampyrus", "Animalia", "Chordata", "Mammalia", "Chiroptera", "Pteropodidae", "Pteropus"],
  ["African Bush Elephant", "Loxodonta africana", "Animalia", "Chordata", "Mammalia", "Proboscidea", "Elephantidae", "Loxodonta"],
  ["Asian Elephant", "Elephas maximus", "Animalia", "Chordata", "Mammalia", "Proboscidea", "Elephantidae", "Elephas"],
  ["Red Deer", "Cervus elaphus", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Cervidae", "Cervus"],
  ["Moose", "Alces alces", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Cervidae", "Alces"],
  ["Giraffe", "Giraffa camelopardalis", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Giraffidae", "Giraffa"],
  ["American Bison", "Bison bison", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Bovidae", "Bison"],
  ["Bighorn Sheep", "Ovis canadensis", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Bovidae", "Ovis"],
  ["Dromedary Camel", "Camelus dromedarius", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Camelidae", "Camelus"],
  ["Hippopotamus", "Hippopotamus amphibius", "Animalia", "Chordata", "Mammalia", "Artiodactyla", "Hippopotamidae", "Hippopotamus"],
  ["Plains Zebra", "Equus quagga", "Animalia", "Chordata", "Mammalia", "Perissodactyla", "Equidae", "Equus"],
  ["Horse", "Equus ferus caballus", "Animalia", "Chordata", "Mammalia", "Perissodactyla", "Equidae", "Equus"],
  ["White Rhinoceros", "Ceratotherium simum", "Animalia", "Chordata", "Mammalia", "Perissodactyla", "Rhinocerotidae", "Ceratotherium"],
  ["European Rabbit", "Oryctolagus cuniculus", "Animalia", "Chordata", "Mammalia", "Lagomorpha", "Leporidae", "Oryctolagus"],
  ["Snowshoe Hare", "Lepus americanus", "Animalia", "Chordata", "Mammalia", "Lagomorpha", "Leporidae", "Lepus"],
  ["Platypus", "Ornithorhynchus anatinus", "Animalia", "Chordata", "Mammalia", "Monotremata", "Ornithorhynchidae", "Ornithorhynchus"],
  ["Eastern Gray Kangaroo", "Macropus giganteus", "Animalia", "Chordata", "Mammalia", "Diprotodontia", "Macropodidae", "Macropus"],
  ["Koala", "Phascolarctos cinereus", "Animalia", "Chordata", "Mammalia", "Diprotodontia", "Phascolarctidae", "Phascolarctos"],

  ["Common Raven", "Corvus corax", "Animalia", "Chordata", "Aves", "Passeriformes", "Corvidae", "Corvus"],
  ["Blue Jay", "Cyanocitta cristata", "Animalia", "Chordata", "Aves", "Passeriformes", "Corvidae", "Cyanocitta"],
  ["Black-capped Chickadee", "Poecile atricapillus", "Animalia", "Chordata", "Aves", "Passeriformes", "Paridae", "Poecile"],
  ["American Robin", "Turdus migratorius", "Animalia", "Chordata", "Aves", "Passeriformes", "Turdidae", "Turdus"],
  ["Barn Swallow", "Hirundo rustica", "Animalia", "Chordata", "Aves", "Passeriformes", "Hirundinidae", "Hirundo"],
  ["Scarlet Macaw", "Ara macao", "Animalia", "Chordata", "Aves", "Psittaciformes", "Psittacidae", "Ara"],
  ["Sulphur-crested Cockatoo", "Cacatua galerita", "Animalia", "Chordata", "Aves", "Psittaciformes", "Cacatuidae", "Cacatua"],
  ["Great Horned Owl", "Bubo virginianus", "Animalia", "Chordata", "Aves", "Strigiformes", "Strigidae", "Bubo"],
  ["Tawny Owl", "Strix aluco", "Animalia", "Chordata", "Aves", "Strigiformes", "Strigidae", "Strix"],
  ["Peregrine Falcon", "Falco peregrinus", "Animalia", "Chordata", "Aves", "Falconiformes", "Falconidae", "Falco"],
  ["Bald Eagle", "Haliaeetus leucocephalus", "Animalia", "Chordata", "Aves", "Accipitriformes", "Accipitridae", "Haliaeetus"],
  ["Golden Eagle", "Aquila chrysaetos", "Animalia", "Chordata", "Aves", "Accipitriformes", "Accipitridae", "Aquila"],
  ["Emperor Penguin", "Aptenodytes forsteri", "Animalia", "Chordata", "Aves", "Sphenisciformes", "Spheniscidae", "Aptenodytes"],
  ["Humboldt Penguin", "Spheniscus humboldti", "Animalia", "Chordata", "Aves", "Sphenisciformes", "Spheniscidae", "Spheniscus"],
  ["Mallard", "Anas platyrhynchos", "Animalia", "Chordata", "Aves", "Anseriformes", "Anatidae", "Anas"],
  ["Mute Swan", "Cygnus olor", "Animalia", "Chordata", "Aves", "Anseriformes", "Anatidae", "Cygnus"],
  ["Common Ostrich", "Struthio camelus", "Animalia", "Chordata", "Aves", "Struthioniformes", "Struthionidae", "Struthio"],
  ["Ruby-throated Hummingbird", "Archilochus colubris", "Animalia", "Chordata", "Aves", "Apodiformes", "Trochilidae", "Archilochus"],
  ["Greater Flamingo", "Phoenicopterus roseus", "Animalia", "Chordata", "Aves", "Phoenicopteriformes", "Phoenicopteridae", "Phoenicopterus"],
  ["Common Kingfisher", "Alcedo atthis", "Animalia", "Chordata", "Aves", "Coraciiformes", "Alcedinidae", "Alcedo"],

  ["Corn Snake", "Pantherophis guttatus", "Animalia", "Chordata", "Reptilia", "Squamata", "Colubridae", "Pantherophis"],
  ["Western Diamondback Rattlesnake", "Crotalus atrox", "Animalia", "Chordata", "Reptilia", "Squamata", "Viperidae", "Crotalus"],
  ["Green Iguana", "Iguana iguana", "Animalia", "Chordata", "Reptilia", "Squamata", "Iguanidae", "Iguana"],
  ["Tokay Gecko", "Gekko gecko", "Animalia", "Chordata", "Reptilia", "Squamata", "Gekkonidae", "Gekko"],
  ["Veiled Chameleon", "Chamaeleo calyptratus", "Animalia", "Chordata", "Reptilia", "Squamata", "Chamaeleonidae", "Chamaeleo"],
  ["Galápagos Tortoise", "Chelonoidis niger", "Animalia", "Chordata", "Reptilia", "Testudines", "Testudinidae", "Chelonoidis"],
  ["Green Sea Turtle", "Chelonia mydas", "Animalia", "Chordata", "Reptilia", "Testudines", "Cheloniidae", "Chelonia"],
  ["Nile Crocodile", "Crocodylus niloticus", "Animalia", "Chordata", "Reptilia", "Crocodilia", "Crocodylidae", "Crocodylus"],
  ["American Alligator", "Alligator mississippiensis", "Animalia", "Chordata", "Reptilia", "Crocodilia", "Alligatoridae", "Alligator"],

  ["American Bullfrog", "Lithobates catesbeianus", "Animalia", "Chordata", "Amphibia", "Anura", "Ranidae", "Lithobates"],
  ["Common Toad", "Bufo bufo", "Animalia", "Chordata", "Amphibia", "Anura", "Bufonidae", "Bufo"],
  ["Dyeing Poison Frog", "Dendrobates tinctorius", "Animalia", "Chordata", "Amphibia", "Anura", "Dendrobatidae", "Dendrobates"],
  ["American Green Tree Frog", "Hyla cinerea", "Animalia", "Chordata", "Amphibia", "Anura", "Hylidae", "Hyla"],
  ["Fire Salamander", "Salamandra salamandra", "Animalia", "Chordata", "Amphibia", "Caudata", "Salamandridae", "Salamandra"],
  ["Axolotl", "Ambystoma mexicanum", "Animalia", "Chordata", "Amphibia", "Caudata", "Ambystomatidae", "Ambystoma"],

  ["Ocellaris Clownfish", "Amphiprion ocellaris", "Animalia", "Chordata", "Actinopterygii", "Perciformes", "Pomacentridae", "Amphiprion"],
  ["Common Carp", "Cyprinus carpio", "Animalia", "Chordata", "Actinopterygii", "Cypriniformes", "Cyprinidae", "Cyprinus"],
  ["Atlantic Salmon", "Salmo salar", "Animalia", "Chordata", "Actinopterygii", "Salmoniformes", "Salmonidae", "Salmo"],
  ["Common Seahorse", "Hippocampus kuda", "Animalia", "Chordata", "Actinopterygii", "Syngnathiformes", "Syngnathidae", "Hippocampus"],
  ["Torafugu", "Takifugu rubripes", "Animalia", "Chordata", "Actinopterygii", "Tetraodontiformes", "Tetraodontidae", "Takifugu"],
  ["Bull Shark", "Carcharhinus leucas", "Animalia", "Chordata", "Chondrichthyes", "Carcharhiniformes", "Carcharhinidae", "Carcharhinus"],
  ["Giant Oceanic Manta Ray", "Mobula birostris", "Animalia", "Chordata", "Chondrichthyes", "Myliobatiformes", "Myliobatidae", "Mobula"],

  ["Monarch Butterfly", "Danaus plexippus", "Animalia", "Arthropoda", "Insecta", "Lepidoptera", "Nymphalidae", "Danaus"],
  ["Seven-spot Ladybird", "Coccinella septempunctata", "Animalia", "Arthropoda", "Insecta", "Coleoptera", "Coccinellidae", "Coccinella"],
  ["European Stag Beetle", "Lucanus cervus", "Animalia", "Arthropoda", "Insecta", "Coleoptera", "Lucanidae", "Lucanus"],
  ["Western Honey Bee", "Apis mellifera", "Animalia", "Arthropoda", "Insecta", "Hymenoptera", "Apidae", "Apis"],
  ["Leafcutter Ant", "Atta cephalotes", "Animalia", "Arthropoda", "Insecta", "Hymenoptera", "Formicidae", "Atta"],
  ["Broad-bodied Chaser", "Libellula depressa", "Animalia", "Arthropoda", "Insecta", "Odonata", "Libellulidae", "Libellula"],
  ["Desert Locust", "Schistocerca gregaria", "Animalia", "Arthropoda", "Insecta", "Orthoptera", "Acrididae", "Schistocerca"],
  ["European Mantis", "Mantis religiosa", "Animalia", "Arthropoda", "Insecta", "Mantodea", "Mantidae", "Mantis"],
  ["Goliath Birdeater", "Theraphosa blondi", "Animalia", "Arthropoda", "Arachnida", "Araneae", "Theraphosidae", "Theraphosa"],
  ["Zebra Jumping Spider", "Salticus scenicus", "Animalia", "Arthropoda", "Arachnida", "Araneae", "Salticidae", "Salticus"],
  ["Deathstalker Scorpion", "Androctonus australis", "Animalia", "Arthropoda", "Arachnida", "Scorpiones", "Buthidae", "Androctonus"],
  ["Edible Crab", "Cancer pagurus", "Animalia", "Arthropoda", "Malacostraca", "Decapoda", "Cancridae", "Cancer"],
  ["American Lobster", "Homarus americanus", "Animalia", "Arthropoda", "Malacostraca", "Decapoda", "Nephropidae", "Homarus"],

  ["Common Octopus", "Octopus vulgaris", "Animalia", "Mollusca", "Cephalopoda", "Octopoda", "Octopodidae", "Octopus"],
  ["Longfin Squid", "Doryteuthis pealeii", "Animalia", "Mollusca", "Cephalopoda", "Myopsida", "Loliginidae", "Doryteuthis"],
  ["Garden Snail", "Cornu aspersum", "Animalia", "Mollusca", "Gastropoda", "Stylommatophora", "Helicidae", "Cornu"],
  ["Pacific Oyster", "Crassostrea gigas", "Animalia", "Mollusca", "Bivalvia", "Ostreida", "Ostreidae", "Crassostrea"],

  ["Mauve Stinger", "Pelagia noctiluca", "Animalia", "Cnidaria", "Scyphozoa", "Semaeostomeae", "Pelagiidae", "Pelagia"],
  ["Staghorn Coral", "Acropora cervicornis", "Animalia", "Cnidaria", "Anthozoa", "Scleractinia", "Acroporidae", "Acropora"],
  ["Common Starfish", "Asterias rubens", "Animalia", "Echinodermata", "Asteroidea", "Forcipulatida", "Asteriidae", "Asterias"],
  ["Common Earthworm", "Lumbricus terrestris", "Animalia", "Annelida", "Clitellata", "Crassiclitellata", "Lumbricidae", "Lumbricus"],

  ["Dog Rose", "Rosa canina", "Plantae", "Tracheophyta", "Magnoliopsida", "Rosales", "Rosaceae", "Rosa"],
  ["Apple", "Malus domestica", "Plantae", "Tracheophyta", "Magnoliopsida", "Rosales", "Rosaceae", "Malus"],
  ["Common Fig", "Ficus carica", "Plantae", "Tracheophyta", "Magnoliopsida", "Rosales", "Moraceae", "Ficus"],
  ["Chinese Wisteria", "Wisteria sinensis", "Plantae", "Tracheophyta", "Magnoliopsida", "Fabales", "Fabaceae", "Wisteria"],
  ["White Clover", "Trifolium repens", "Plantae", "Tracheophyta", "Magnoliopsida", "Fabales", "Fabaceae", "Trifolium"],
  ["English Oak", "Quercus robur", "Plantae", "Tracheophyta", "Magnoliopsida", "Fagales", "Fagaceae", "Quercus"],
  ["Silver Birch", "Betula pendula", "Plantae", "Tracheophyta", "Magnoliopsida", "Fagales", "Betulaceae", "Betula"],
  ["Common Sunflower", "Helianthus annuus", "Plantae", "Tracheophyta", "Magnoliopsida", "Asterales", "Asteraceae", "Helianthus"],
  ["Common Dandelion", "Taraxacum officinale", "Plantae", "Tracheophyta", "Magnoliopsida", "Asterales", "Asteraceae", "Taraxacum"],
  ["English Lavender", "Lavandula angustifolia", "Plantae", "Tracheophyta", "Magnoliopsida", "Lamiales", "Lamiaceae", "Lavandula"],
  ["Lilac", "Syringa vulgaris", "Plantae", "Tracheophyta", "Magnoliopsida", "Lamiales", "Oleaceae", "Syringa"],
  ["Common Bamboo", "Bambusa vulgaris", "Plantae", "Tracheophyta", "Magnoliopsida", "Poales", "Poaceae", "Bambusa"],
  ["Maize", "Zea mays", "Plantae", "Tracheophyta", "Magnoliopsida", "Poales", "Poaceae", "Zea"],
  ["Pineapple", "Ananas comosus", "Plantae", "Tracheophyta", "Magnoliopsida", "Poales", "Bromeliaceae", "Ananas"],
  ["Tomato", "Solanum lycopersicum", "Plantae", "Tracheophyta", "Magnoliopsida", "Solanales", "Solanaceae", "Solanum"],
  ["Cacao", "Theobroma cacao", "Plantae", "Tracheophyta", "Magnoliopsida", "Malvales", "Malvaceae", "Theobroma"],
  ["Common Poppy", "Papaver rhoeas", "Plantae", "Tracheophyta", "Magnoliopsida", "Ranunculales", "Papaveraceae", "Papaver"],
  ["Saguaro", "Carnegiea gigantea", "Plantae", "Tracheophyta", "Magnoliopsida", "Caryophyllales", "Cactaceae", "Carnegiea"],
  ["Tropical Pitcher Plant", "Nepenthes rafflesiana", "Plantae", "Tracheophyta", "Magnoliopsida", "Caryophyllales", "Nepenthaceae", "Nepenthes"],
  ["Madonna Lily", "Lilium candidum", "Plantae", "Tracheophyta", "Liliopsida", "Liliales", "Liliaceae", "Lilium"],
  ["Coconut Palm", "Cocos nucifera", "Plantae", "Tracheophyta", "Liliopsida", "Arecales", "Arecaceae", "Cocos"],
  ["White Water-lily", "Nymphaea alba", "Plantae", "Tracheophyta", "Magnoliopsida", "Nymphaeales", "Nymphaeaceae", "Nymphaea"],
  ["Scots Pine", "Pinus sylvestris", "Plantae", "Pinophyta", "Pinopsida", "Pinales", "Pinaceae", "Pinus"],
  ["European Silver Fir", "Abies alba", "Plantae", "Pinophyta", "Pinopsida", "Pinales", "Pinaceae", "Abies"],
  ["Giant Sequoia", "Sequoiadendron giganteum", "Plantae", "Pinophyta", "Pinopsida", "Pinales", "Cupressaceae", "Sequoiadendron"],
  ["Male Fern", "Dryopteris filix-mas", "Plantae", "Polypodiophyta", "Polypodiopsida", "Polypodiales", "Dryopteridaceae", "Dryopteris"],
  ["Silvergreen Bryum Moss", "Bryum argenteum", "Plantae", "Bryophyta", "Bryopsida", "Bryales", "Bryaceae", "Bryum"],

  ["Button Mushroom", "Agaricus bisporus", "Fungi", "Basidiomycota", "Agaricomycetes", "Agaricales", "Agaricaceae", "Agaricus"],
  ["Fly Agaric", "Amanita muscaria", "Fungi", "Basidiomycota", "Agaricomycetes", "Agaricales", "Amanitaceae", "Amanita"],
  ["Turkey Tail", "Trametes versicolor", "Fungi", "Basidiomycota", "Agaricomycetes", "Polyporales", "Polyporaceae", "Trametes"],
  ["Common Morel", "Morchella esculenta", "Fungi", "Ascomycota", "Pezizomycetes", "Pezizales", "Morchellaceae", "Morchella"],
  ["Baker's Yeast", "Saccharomyces cerevisiae", "Fungi", "Ascomycota", "Saccharomycetes", "Saccharomycetales", "Saccharomycetaceae", "Saccharomyces"],
];

export const SPECIES = RAW_SPECIES.map(
  ([common, binomial, kingdom, phylum, cls, order, family, genus]) => ({
    common,
    binomial,
    kingdom,
    phylum,
    class: cls,
    order,
    family,
    genus,
  }),
);

// The one rule that makes this "globally stable": never reorder or resize
// SPECIES above. Same DID in → same index out, for any caller, forever.
export function speciesForDid(did) {
  return SPECIES[fnv1a(did) % SPECIES.length];
}

// ---- Bluesky graph reads (copied from neighborhood/public/lib/hood.js) ----

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to its network: mutuals (follows ∩ followers), widened to
// plain follows if there aren't enough to make an interesting tree. Returns
// { did, handle, self, pool, kind, counts } — `pool` always includes self.
export async function network(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("finding who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("finding who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "mutuals";
  const pool = mutuals.slice();
  if (pool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "mutuals + follows";
  }
  pool.push(self);

  return {
    did,
    handle: self.handle,
    self,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
    },
  };
}

// ---- tree building ----------------------------------------------------------

const RANKS = ["kingdom", "phylum", "class", "order", "family", "genus"];

// Turn a flat list of { did, handle, displayName, isSelf } into a nested tree:
// { name, rank, count, children: Map|[], people: [] } rooted at "Life".
// Each person is annotated with their species and slotted at the species leaf.
export function buildTree(people) {
  const root = { name: "Life", rank: "root", children: new Map(), people: [] };
  for (const person of people) {
    const sp = speciesForDid(person.did);
    let node = root;
    for (const rank of RANKS) {
      const key = sp[rank];
      if (!node.children.has(key)) {
        node.children.set(key, {
          name: key,
          rank,
          children: new Map(),
          people: [],
        });
      }
      node = node.children.get(key);
    }
    // node is now the genus level; drop to the species leaf itself
    if (!node.children.has(sp.common)) {
      node.children.set(sp.common, {
        name: sp.common,
        rank: "species",
        binomial: sp.binomial,
        children: new Map(),
        people: [],
      });
    }
    node.children.get(sp.common).people.push(person);
  }
  return root;
}

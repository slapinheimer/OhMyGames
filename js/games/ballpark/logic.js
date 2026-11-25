// Ballpark — five absurd comparisons. Each question pairs two things, and a
// round never uses the same thing twice. The slider covers one decade.
// Landing inside 30% of that decade's top scores. Closer is worth more.
// Questions are worth 100, 150, 200, 250, then 300.
import { seededRandom, shuffle } from "../../core/rng.js";

export const POINTS = [100, 150, 200, 250, 300];

export const BANDS = [
  { id: "fire", label: "on fire", limit: 0.01, mark: "🔥" },
  { id: "hot", label: "hot", limit: 0.05, mark: "🌶️" },
  { id: "warm", label: "warm", limit: 0.15, mark: "☕" },
  { id: "luke", label: "lukewarm", limit: 0.30, mark: "🛁" },
  { id: "cold", label: "ice cold", limit: Infinity, mark: "🧊" },
];

const COLD = BANDS[BANDS.length - 1];

// Approximate everyday measures. Facts are built from these numbers.
// subject is shared by the length and weight of the same thing, so a round
// cannot ask about a blue whale's length and its weight.
// Length rows: subject, centimeters, one, many, span ("long", "tall", "across").
const LENGTHS = [
  ["sesame", 0.3, "a sesame seed", "sesame seeds", "long"],
  ["rice", 0.6, "a grain of rice", "grains of rice", "long"],
  ["marble", 1.5, "a marble", "marbles", "across"],
  ["die", 1.6, "a die", "dice", "across"],
  ["quarter", 2.4, "a quarter", "quarters", "across"],
  ["paperclip", 3, "a paperclip", "paperclips", "long"],
  ["lego", 3.2, "a Lego brick", "Lego bricks", "long"],
  ["golf", 4.3, "a golf ball", "golf balls", "across"],
  ["pingpong", 4, "a ping-pong ball", "ping-pong balls", "across"],
  ["tennis", 6.7, "a tennis ball", "tennis balls", "across"],
  ["sticky", 7.6, "a sticky note", "sticky notes", "tall"],
  ["card", 8.6, "a credit card", "credit cards", "tall"],
  ["playing", 8.9, "a playing card", "playing cards", "tall"],
  ["crayon", 9, "a crayon", "crayons", "long"],
  ["hotdog", 15, "a hot dog", "hot dogs", "long"],
  ["phone", 15, "a smartphone", "smartphones", "tall"],
  ["dollar", 15.6, "a dollar bill", "dollar bills", "long"],
  ["banana", 18, "a banana", "bananas", "long"],
  ["pencil", 19, "a pencil", "pencils", "long"],
  ["brush", 20, "a toothbrush", "toothbrushes", "long"],
  ["chopstick", 23, "a chopstick", "chopsticks", "long"],
  ["basketball", 24, "a basketball", "basketballs", "across"],
  ["soccer", 22, "a soccer ball", "soccer balls", "across"],
  ["spaghetti", 25, "a spaghetti noodle", "spaghetti noodles", "long"],
  ["football", 28, "an American football", "American footballs", "long"],
  ["ruler", 30, "a ruler", "rulers", "long"],
  ["record", 30, "a vinyl record", "vinyl records", "across"],
  ["laptop", 32, "a laptop", "laptops", "wide"],
  ["pizza", 35, "a large pizza", "large pizzas", "across"],
  ["pin", 38, "a bowling pin", "bowling pins", "tall"],
  ["baguette", 65, "a baguette", "baguettes", "long"],
  ["skateboard", 80, "a skateboard", "skateboards", "long"],
  ["bat", 86, "a baseball bat", "baseball bats", "long"],
  ["guitar", 100, "a guitar", "guitars", "long"],
  ["fridge", 170, "a refrigerator", "refrigerators", "tall"],
  ["bike", 180, "a bicycle", "bicycles", "long"],
  ["door", 200, "a door", "doors", "tall"],
  ["surfboard", 220, "a surfboard", "surfboards", "long"],
  ["kayak", 300, "a kayak", "kayaks", "long"],
  ["car", 450, "a car", "cars", "long"],
  ["giraffe", 500, "a giraffe", "giraffes", "tall"],
  ["limo", 850, "a stretch limousine", "stretch limousines", "long"],
  ["bus", 1200, "a school bus", "school buses", "long"],
  ["sailboat", 1500, "a sailboat", "sailboats", "long"],
  ["lane", 1900, "a bowling lane", "bowling lanes", "long"],
  ["semi", 2000, "a semi truck", "semi trucks", "long"],
  ["subway", 1800, "a subway car", "subway cars", "long"],
  ["court", 2400, "a tennis court", "tennis courts", "long"],
  ["whale", 2500, "a blue whale", "blue whales", "long"],
  ["hoop", 2900, "a basketball court", "basketball courts", "long"],
  ["falls", 5100, "Niagara Falls", "Niagara Falls", "tall"],
  ["pool", 5000, "an Olympic pool", "Olympic pools", "long"],
  ["liberty", 9300, "the Statue of Liberty", "Statues of Liberty", "tall"],
  ["jet", 7100, "a Boeing 747", "Boeing 747s", "long"],
  ["field", 9100, "a football field", "football fields", "long"],
  ["pitch", 10500, "a soccer pitch", "soccer pitches", "long"],
  ["redwood", 11500, "a coast redwood", "coast redwoods", "tall"],
  ["pyramid", 13900, "the Great Pyramid", "Great Pyramids", "tall"],
  ["monument", 16900, "the Washington Monument", "Washington Monuments", "tall"],
  ["needle", 18400, "the Space Needle", "Space Needles", "tall"],
  ["arch", 19200, "the Gateway Arch", "Gateway Arches", "tall"],
  ["bridge", 22700, "a Golden Gate tower", "Golden Gate towers", "tall"],
  ["shard", 31000, "the Shard", "Shards", "tall"],
  ["eiffel", 33000, "the Eiffel Tower", "Eiffel Towers", "tall"],
  ["carrier", 33300, "an aircraft carrier", "aircraft carriers", "long"],
  ["ship", 36000, "a cruise ship", "cruise ships", "long"],
  ["empire", 44300, "the Empire State Building", "Empire State Buildings", "tall"],
  ["track", 40000, "a lap of a running track", "laps of a running track", "long"],
  ["burj", 83000, "the Burj Khalifa", "Burj Khalifas", "tall"],
  ["park", 400000, "Central Park", "Central Parks", "long"],
  ["mile", 160900, "a mile", "miles", "long"],
  ["channel", 3300000, "the English Channel", "English Channels", "across"],
  ["everest", 884900, "Mount Everest", "Mount Everests", "tall"],
  ["marathon", 4219500, "a marathon", "marathons", "long"],
];

// Weight rows: subject, grams, one, many.
const MASSES = [
  ["paperclip", 1, "a paperclip", "paperclips"],
  ["dollar", 1, "a dollar bill", "dollar bills"],
  ["penny", 2.5, "a penny", "pennies"],
  ["pingpong", 2.7, "a ping-pong ball", "ping-pong balls"],
  ["sugar", 4, "a teaspoon of sugar", "teaspoons of sugar"],
  ["hummingbird", 4, "a hummingbird", "hummingbirds"],
  ["paper", 5, "a sheet of paper", "sheets of paper"],
  ["nickel", 5, "a nickel", "nickels"],
  ["quarter", 5.7, "a quarter", "quarters"],
  ["mouse", 20, "a house mouse", "house mice"],
  ["battery", 23, "an AA battery", "AA batteries"],
  ["golf", 46, "a golf ball", "golf balls"],
  ["egg", 50, "an egg", "eggs"],
  ["tennis", 58, "a tennis ball", "tennis balls"],
  ["robin", 80, "a robin", "robins"],
  ["hamster", 120, "a hamster", "hamsters"],
  ["baseball", 145, "a baseball", "baseballs"],
  ["phone", 170, "a smartphone", "smartphones"],
  ["apple", 180, "an apple", "apples"],
  ["burger", 200, "a hamburger", "hamburgers"],
  ["soccer", 430, "a soccer ball", "soccer balls"],
  ["bread", 500, "a loaf of bread", "loaves of bread"],
  ["basketball", 620, "a basketball", "basketballs"],
  ["soda", 380, "a can of soda", "cans of soda"],
  ["football", 420, "an American football", "American footballs"],
  ["pineapple", 1000, "a pineapple", "pineapples"],
  ["wine", 1200, "a bottle of wine", "bottles of wine"],
  ["pin", 1500, "a bowling pin", "bowling pins"],
  ["laptop", 1800, "a laptop", "laptops"],
  ["chicken", 2000, "a chicken", "chickens"],
  ["brick", 2300, "a brick", "bricks"],
  ["flour", 2300, "a five-pound bag of flour", "five-pound bags of flour"],
  ["chihuahua", 2500, "a Chihuahua", "Chihuahuas"],
  ["milk", 3900, "a gallon of milk", "gallons of milk"],
  ["paint", 4000, "a gallon of paint", "gallons of paint"],
  ["cat", 4500, "a house cat", "house cats"],
  ["eagle", 4500, "a bald eagle", "bald eagles"],
  ["bowl", 6400, "a bowling ball", "bowling balls"],
  ["turkey", 7000, "a turkey", "turkeys"],
  ["melon", 8000, "a watermelon", "watermelons"],
  ["tire", 11000, "a car tire", "car tires"],
  ["bike", 12000, "a bicycle", "bicycles"],
  ["gold", 12400, "a gold bar", "gold bars"],
  ["block", 14000, "a cinder block", "cinder blocks"],
  ["microwave", 15000, "a microwave", "microwaves"],
  ["labrador", 30000, "a Labrador", "Labradors"],
  ["person", 70000, "a person", "people"],
  ["washer", 80000, "a washing machine", "washing machines"],
  ["roo", 85000, "a kangaroo", "kangaroos"],
  ["fridge", 90000, "a refrigerator", "refrigerators"],
  ["gorilla", 160000, "a gorilla", "gorillas"],
  ["piano-up", 180000, "an upright piano", "upright pianos"],
  ["lion", 190000, "a lion", "lions"],
  ["moto", 200000, "a motorcycle", "motorcycles"],
  ["tiger", 220000, "a tiger", "tigers"],
  ["grizzly", 270000, "a grizzly bear", "grizzly bears"],
  ["piano", 400000, "a grand piano", "grand pianos"],
  ["polar", 450000, "a polar bear", "polar bears"],
  ["horse", 500000, "a horse", "horses"],
  ["cow", 650000, "a dairy cow", "dairy cows"],
  ["giraffe", 1000000, "a giraffe", "giraffes"],
  ["hippo", 1800000, "a hippo", "hippos"],
  ["car", 1400000, "a car", "cars"],
  ["rhino", 2000000, "a rhino", "rhinos"],
  ["pickup", 2200000, "a pickup truck", "pickup trucks"],
  ["elephant", 5000000, "an elephant", "elephants"],
  ["trex", 7000000, "a Tyrannosaurus", "Tyrannosauruses"],
  ["bus", 12000000, "a school bus", "school buses"],
  ["engine", 18000000, "a fire truck", "fire trucks"],
  ["semi", 36000000, "a loaded semi", "loaded semis"],
  ["tank", 62000000, "a battle tank", "battle tanks"],
  ["shuttle", 78000000, "a space shuttle", "space shuttles"],
  ["whale", 150000000, "a blue whale", "blue whales"],
  ["jet", 180000000, "an empty Boeing 747", "empty Boeing 747s"],
  ["liberty", 204000000, "the Statue of Liberty", "Statues of Liberty"],
  ["eiffel", 7300000000, "the Eiffel Tower", "Eiffel Towers"],
];

const INCH = 2.54;
const FOOT = 30.48;
const MILE = 160934.4;
const OUNCE = 28.349523125;
const POUND = 453.59237;
const TON = 2000 * POUND;

function trimTo(n, digits) {
  const factor = 10 ** digits;
  const rounded = Math.round(n * factor) / factor;
  const negative = rounded < 0;
  const fixed = Math.abs(rounded).toFixed(digits);
  let [whole, frac = ""] = fixed.split(".");
  frac = frac.replace(/0+$/, "");
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${text}` : text;
}

function placesFor(n) {
  const abs = Math.abs(n);
  if (abs >= 100) return 0;
  if (abs >= 1) return 1;
  if (abs >= 0.01) return 2;
  return 3;
}

function measure(n, one, many) {
  const text = trimTo(n, placesFor(n));
  return `${text} ${text === "1" ? one : many}`;
}

function capital(phrase) {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// Imperial first, because that is the everyday scale, with metric in parentheses.
function lengthMeasure(cm) {
  const imperial = cm >= MILE
    ? measure(cm / MILE, "mile", "miles")
    : cm >= FOOT
      ? measure(cm / FOOT, "foot", "feet")
      : measure(cm / INCH, "inch", "inches");
  const metric = cm < 100
    ? measure(cm, "centimeter", "centimeters")
    : cm < 100000
      ? measure(cm / 100, "meter", "meters")
      : measure(cm / 100000, "kilometer", "kilometers");
  return `${imperial} (${metric})`;
}

function massMeasure(grams) {
  const pounds = grams / POUND;
  // Pounds stay in use through cars and horses. Tons start around an elephant.
  const imperial = pounds >= 10000
    ? measure(grams / TON, "ton", "tons")
    : pounds >= 1
      ? measure(pounds, "pound", "pounds")
      : measure(grams / OUNCE, "ounce", "ounces");
  const metric = grams < 1000
    ? measure(grams, "gram", "grams")
    : grams < 1000000
      ? measure(grams / 1000, "kilogram", "kilograms")
      : measure(grams / 1000000, "metric ton", "metric tons");
  return `${imperial} (${metric})`;
}

function checkFact(fact) {
  const match = fact.match(/\(([^)]+)\)/);
  const imperial = match ? fact.slice(0, match.index) : fact;
  const metric = match ? match[1] : "";
  const badOne = /(?<![\d.])1 (inches|feet|miles|ounces|pounds|tons|centimeters|meters|kilometers|grams|kilograms|metric tons)\b/;
  const badZero = /(?<![\d.])0 (inch|inches|foot|feet|mile|miles|ounce|ounces|pound|pounds|ton|tons|centimeter|centimeters|meter|meters|kilometer|kilometers|gram|grams|kilogram|kilograms|metric ton|metric tons)\b/;
  if (!match || badOne.test(fact) || badZero.test(fact)
    || !/(inch|foot|feet|mile|ounce|pound|ton)/.test(imperial)
    || !/(centimeter|meter|kilometer|gram|kilogram|metric ton)/.test(metric)) {
    throw new Error(`Ballpark fact needs imperial and metric: ${fact}`);
  }
}

function lengthFact(one, cm, span) {
  const fact = `${capital(one)} is about ${lengthMeasure(cm)} ${span}.`;
  checkFact(fact);
  return fact;
}

function massFact(one, grams) {
  const fact = `${capital(one)} weighs about ${massMeasure(grams)}.`;
  checkFact(fact);
  return fact;
}

function catalog() {
  const items = [];
  const seen = new Set();
  for (const [subject, value, one, many, span] of LENGTHS) {
    const key = `${subject}:length`;
    if (seen.has(key)) throw new Error(`Duplicate length item: ${subject}`);
    seen.add(key);
    items.push({
      subject, kind: "length", value, one, many,
      fact: lengthFact(one, value, span || "long"),
    });
  }
  for (const [subject, value, one, many] of MASSES) {
    const key = `${subject}:mass`;
    if (seen.has(key)) throw new Error(`Duplicate weight item: ${subject}`);
    seen.add(key);
    items.push({ subject, kind: "mass", value, one, many, fact: massFact(one, value) });
  }
  return items;
}

/** Smallest p >= 1 with 10^p >= n. Exact powers stay in that decade. */
export function decadePower(n) {
  let power = 1;
  let cap = 10;
  while (cap < n && power < 15) {
    power += 1;
    cap *= 10;
  }
  return power;
}

/** Round a ratio onto the slider's step and the decade that contains it. */
export function scaleOf(raw) {
  if (!(raw >= 2) || !Number.isFinite(raw)) return null;
  let power = decadePower(raw);
  let step = power <= 3 ? 1 : 10 ** (power - 3);
  let answer = Math.round(raw / step) * step;
  if (answer < 2) return null;
  power = decadePower(answer);
  if (power > 9) return null;
  step = power <= 3 ? 1 : 10 ** (power - 3);
  const min = 10 ** (power - 1);
  const max = 10 ** power;
  answer = Math.round(answer / step) * step;
  if (answer < min) answer = min;
  if (answer > max) answer = max;
  if (answer < 2) return null;
  return { answer, power, step, min, max };
}

function questionText(small, big) {
  if (small.kind === "mass") return `How many ${small.many} match the weight of ${big.one}?`;
  return `How many ${small.many} match the length of ${big.one}?`;
}

function buildPool() {
  const pool = [];
  const texts = new Set();
  const kinds = ["length", "mass"];
  const items = catalog();
  for (const kind of kinds) {
    const group = items.filter((item) => item.kind === kind).sort((a, b) => a.value - b.value);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const small = group[i];
        const big = group[j];
        if (small.subject === big.subject) continue;
        const scale = scaleOf(big.value / small.value);
        if (!scale || scale.answer < 8) continue;
        const text = questionText(small, big);
        if (texts.has(text)) continue;
        texts.add(text);
        pool.push({
          text,
          kind,
          unitName: small.many,
          targetName: big.one,
          unitFact: small.fact,
          targetFact: big.fact,
          subjects: [small.subject, big.subject],
          answer: scale.answer,
          power: scale.power,
          step: scale.step,
          min: scale.min,
          max: scale.max,
        });
      }
    }
  }
  pool.sort((a, b) => a.text.localeCompare(b.text));
  return pool;
}

const POOL = buildPool();

export function poolSize() {
  return POOL.length;
}

function accepts(question, subjects, answers) {
  if (answers.has(question.answer)) return false;
  return question.subjects.every((subject) => !subjects.has(subject));
}

function take(question, picked, subjects, answers) {
  picked.push(question);
  answers.add(question.answer);
  for (const subject of question.subjects) subjects.add(subject);
}

/** Five comparisons. No thing appears twice, and the sizes spread from small to huge. */
export function makePuzzle(puzzleId) {
  const rng = seededRandom("ballpark", String(puzzleId));
  const shuffled = shuffle(POOL, rng);
  const byAnswer = shuffled.slice().sort((a, b) => a.answer - b.answer || a.text.localeCompare(b.text));
  const bands = [];
  for (let i = 0; i < 5; i++) {
    const start = Math.floor(i * byAnswer.length / 5);
    const end = Math.floor((i + 1) * byAnswer.length / 5);
    bands.push(shuffle(byAnswer.slice(start, end), rng));
  }
  const picked = [];
  const subjects = new Set();
  const answers = new Set();
  for (const band of bands) {
    const previous = picked[picked.length - 1];
    const prefer = previous ? (previous.kind === "length" ? "mass" : "length") : (rng() < 0.5 ? "length" : "mass");
    const question = band.find((item) => item.kind === prefer && accepts(item, subjects, answers))
      || band.find((item) => accepts(item, subjects, answers));
    if (question) take(question, picked, subjects, answers);
  }
  if (picked.length < 5) {
    for (const question of shuffled) {
      if (picked.length === 5) break;
      if (!accepts(question, subjects, answers)) continue;
      take(question, picked, subjects, answers);
    }
  }
  if (picked.length < 5) throw new Error("Ballpark could not build a puzzle");
  picked.sort((a, b) => a.answer - b.answer);
  return {
    questions: picked.map((question, index) => ({ ...question, points: POINTS[index] })),
  };
}

export function formatCount(n) {
  return Math.round(n).toLocaleString("en-US");
}

export function sliderStart(question) {
  const mid = question.min + (question.max - question.min) / 2;
  const stepped = Math.round(mid / question.step) * question.step;
  return Math.min(question.max, Math.max(question.min, stepped));
}

export function clampGuess(question, value) {
  const stepped = Math.round(Number(value) / question.step) * question.step;
  return Math.min(question.max, Math.max(question.min, stepped));
}

export function evaluateGuess(question, guess) {
  const scale = 10 ** question.power;
  const amount = Math.abs(guess - question.answer);
  const fraction = amount / scale;
  const band = fraction >= 0.3
    ? COLD
    : BANDS.find((item) => amount <= Math.max(1, item.limit * scale)) || COLD;
  let direction = "exact";
  if (guess < question.answer) direction = "low";
  else if (guess > question.answer) direction = "high";
  return { band, amount, fraction, direction };
}

/**
 * Points taper from the question's full value down to 0 at 30% of the decade.
 * For decades above 1,000, the first 1% of the decade still scores full points.
 * The first hint of the round is free. A later hint halves that question.
 */
export function scoreGuess(question, guess, { hinted = false, hintsUsed = 0 } = {}) {
  const evaluation = evaluateGuess(question, guess);
  let points = 0;
  if (evaluation.fraction < 0.3) {
    const grace = question.power <= 3 ? 0 : 0.01;
    points = Math.ceil(question.points * (1 - Math.max(0, evaluation.fraction - grace) / (0.3 - grace)));
  }
  const halved = !!(hinted && hintsUsed > 1);
  if (halved) points = Math.round(points * 0.5);
  return { ...evaluation, points, halved };
}

export function closenessText(evaluation) {
  if (evaluation.amount === 0) return "the exact answer.";
  if (evaluation.fraction < 0.3) return `within ${Math.ceil(evaluation.fraction * 100)}% of the scale.`;
  return "beyond 30% of the scale.";
}

export function explainLines(question, guess, evaluation) {
  return [
    question.text,
    question.unitFact,
    question.targetFact,
    `Rounded, the answer is ${formatCount(question.answer)}.`,
    `You guessed ${formatCount(guess)}, which is ${closenessText(evaluation)}`,
  ];
}

export function freshState() {
  return {
    v: 2,
    status: "playing",
    index: 0,
    phase: "guess",
    score: 0,
    guesses: [],
    bands: [],
    points: [],
    halved: [],
    hinted: [],
  };
}

export function repair(saved, puzzle) {
  const state = freshState();
  const count = puzzle.questions.length;
  // v1 saved a whole round that reused one thing. Those guesses do not match
  // this catalog, so an old round starts over. The storage key stays the date,
  // which is what the hub reads.
  if (!saved || typeof saved !== "object" || saved.v !== 2) return state;
  state.guesses = Array.isArray(saved.guesses) ? saved.guesses.slice(0, count).map(Number) : [];
  state.bands = Array.isArray(saved.bands) ? saved.bands.slice(0, state.guesses.length) : [];
  state.points = Array.isArray(saved.points) ? saved.points.slice(0, state.guesses.length).map(Number) : [];
  state.halved = Array.isArray(saved.halved) ? saved.halved.slice(0, state.guesses.length).map(Boolean) : [];
  state.hinted = Array.isArray(saved.hinted)
    ? [...new Set(saved.hinted.map(Number).filter((index) => index >= 0 && index < count))]
    : [];
  state.score = state.points.reduce((sum, value) => sum + value, 0);
  state.index = Math.min(Math.max(state.guesses.length - 1, 0), count - 1);
  if (saved.status === "done" && state.guesses.length === count) {
    state.status = "done";
    state.phase = "reveal";
    state.index = count - 1;
    return state;
  }
  if (saved.phase === "reveal" && state.guesses.length > 0) {
    state.phase = "reveal";
    state.index = state.guesses.length - 1;
  } else {
    state.phase = "guess";
    state.index = Math.min(state.guesses.length, count - 1);
  }
  return state;
}

export function resultBucket(score) {
  if (score <= 0) return "0";
  if (score <= 300) return "300";
  if (score <= 600) return "600";
  if (score <= 900) return "900";
  return "1000";
}

export function shareText({ puzzle, state }) {
  const head = puzzle.isDaily && puzzle.number != null
    ? `Oh My NUMBERS! Ballpark ${puzzle.number}`
    : "Oh My NUMBERS! Ballpark";
  const marks = state.bands.map((id) => (BANDS.find((band) => band.id === id) || COLD).mark).join("");
  return [head, `${state.score}`, marks].filter(Boolean).join("\n");
}

export function bandById(id) {
  return BANDS.find((band) => band.id === id) || COLD;
}

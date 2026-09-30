// Industry profiles used to adapt a sales script to a prospect's business.
//
// keywords: phrases searched for on the prospect's website (case-insensitive,
//   whole-word). Each hit adds `weight` (default 1) to the profile's score.
// schemaTypes: schema.org @type values that strongly indicate this profile.
// vocab: words substituted into the script ({{customers}}, {{venue}}, ...).

export const PROFILES = [
  {
    id: 'cocktail_bar',
    label: 'Cocktail / mixology bar',
    schemaTypes: ['BarOrPub', 'NightClub', 'FoodEstablishment'],
    keywords: [
      ['mixology', 3], ['mixologist', 3], ['mixologists', 3], ['craft cocktails', 3],
      ['craft cocktail', 3], ['cocktail bar', 3], ['cocktail bars', 3], ['speakeasy', 3], ['cocktail menu', 2],
      ['cocktails', 2], ['bartenders', 1], ['bartender', 1], ['negroni', 2],
      ['old fashioned', 1], ['martini', 1], ['mezcal', 1], ['bitters', 1],
      ['spirits', 1], ['happy hour', 1], ['lounge', 1],
    ],
    vocab: {
      customers: 'clients', customer: 'client', venue: 'bar', team: 'bar team',
      offering: 'cocktail program', visit: 'night out',
    },
  },
  {
    id: 'diner',
    label: 'Diner',
    schemaTypes: ['Diner', 'FoodEstablishment'],
    keywords: [
      ['diner', 4], ['all day breakfast', 3], ['breakfast all day', 3], ['all-day breakfast', 3],
      ['pancakes', 2], ['waffles', 2], ['hash browns', 2], ['milkshakes', 2], ['milkshake', 2],
      ['blue plate', 2], ['short order', 2], ['bottomless coffee', 2], ['eggs any style', 2],
      ['home cooking', 2], ['breakfast', 1], ['burgers', 1], ['omelets', 1], ['omelettes', 1],
      ['since 19', 1], ['family owned', 1],
    ],
    vocab: {
      customers: 'regulars', customer: 'regular', venue: 'diner', team: 'staff',
      offering: 'menu', visit: 'visit',
    },
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    schemaTypes: ['Restaurant', 'FoodEstablishment'],
    keywords: [
      ['restaurant', 3], ['tasting menu', 3], ['prix fixe', 3], ['reservations', 1],
      ['reserve a table', 2], ['book a table', 2], ['chef', 2], ['cuisine', 2],
      ['dinner menu', 2], ['wine list', 2], ['entrees', 1], ['entrées', 1], ['dining', 1],
      ['brunch', 1], ['private dining', 2], ['seasonal menu', 2],
    ],
    vocab: {
      customers: 'guests', customer: 'guest', venue: 'restaurant', team: 'front-of-house team',
      offering: 'menu', visit: 'reservation',
    },
  },
  {
    id: 'cafe',
    label: 'Café / coffee shop',
    schemaTypes: ['CafeOrCoffeeShop', 'Bakery', 'FoodEstablishment'],
    keywords: [
      ['coffee shop', 4], ['café', 3], ['cafe', 3], ['espresso', 2], ['latte', 2],
      ['cappuccino', 2], ['pour over', 2], ['roastery', 3], ['roasters', 2], ['barista', 2],
      ['pastries', 1], ['bakery', 2], ['cold brew', 2], ['single origin', 2],
    ],
    vocab: {
      customers: 'regulars', customer: 'regular', venue: 'café', team: 'baristas',
      offering: 'menu', visit: 'visit',
    },
  },
  {
    id: 'brewery_pub',
    label: 'Brewery / pub',
    schemaTypes: ['Brewery', 'Winery', 'FoodEstablishment'],
    keywords: [
      ['brewery', 4], ['brewpub', 4], ['taproom', 4], ['craft beer', 3], ['on tap', 2],
      ['pub', 2], ['pints', 2], ['ipa', 2], ['lager', 1], ['stout', 1], ['beer garden', 2],
      ['growlers', 2], ['winery', 3], ['tasting room', 2],
    ],
    vocab: {
      customers: 'patrons', customer: 'patron', venue: 'taproom', team: 'bar staff',
      offering: 'tap list', visit: 'visit',
    },
  },
  {
    id: 'salon_spa',
    label: 'Salon / spa',
    schemaTypes: ['BeautySalon', 'HairSalon', 'DaySpa', 'NailSalon', 'HealthAndBeautyBusiness'],
    keywords: [
      ['salon', 4], ['spa', 3], ['stylist', 2], ['stylists', 2], ['haircut', 2], ['balayage', 3],
      ['manicure', 2], ['pedicure', 2], ['facial', 2], ['facials', 2], ['massage', 2],
      ['lashes', 2], ['waxing', 2], ['book an appointment', 1],
    ],
    vocab: {
      customers: 'clients', customer: 'client', venue: 'salon', team: 'stylists',
      offering: 'services', visit: 'appointment',
    },
  },
  {
    id: 'fitness',
    label: 'Gym / fitness studio',
    schemaTypes: ['ExerciseGym', 'SportsActivityLocation', 'HealthClub'],
    keywords: [
      ['gym', 3], ['fitness', 2], ['personal training', 3], ['personal trainer', 3],
      ['crossfit', 4], ['yoga', 3], ['pilates', 3], ['spin class', 3], ['hiit', 3],
      ['membership', 1], ['memberships', 1], ['class schedule', 2], ['workout', 1],
    ],
    vocab: {
      customers: 'members', customer: 'member', venue: 'studio', team: 'coaches',
      offering: 'classes', visit: 'session',
    },
  },
  {
    id: 'healthcare',
    label: 'Medical / dental practice',
    schemaTypes: ['Dentist', 'MedicalClinic', 'Physician', 'MedicalBusiness', 'Optician', 'Chiropractor'],
    keywords: [
      ['dentist', 4], ['dental', 3], ['orthodontics', 3], ['orthodontist', 3], ['clinic', 2],
      ['patients', 3], ['patient', 2], ['physician', 3], ['chiropractic', 3],
      ['chiropractor', 3], ['physical therapy', 3], ['optometry', 3], ['medical', 2],
      ['insurance accepted', 2], ['new patients', 3],
    ],
    vocab: {
      customers: 'patients', customer: 'patient', venue: 'practice', team: 'front desk',
      offering: 'care', visit: 'appointment',
    },
  },
  {
    id: 'legal',
    label: 'Law firm',
    schemaTypes: ['LegalService', 'Attorney'],
    keywords: [
      ['law firm', 4], ['attorney', 3], ['attorneys', 3], ['lawyer', 3], ['lawyers', 3],
      ['litigation', 3], ['legal services', 2], ['practice areas', 3], ['free consultation', 1],
      ['personal injury', 2], ['estate planning', 2],
    ],
    vocab: {
      customers: 'clients', customer: 'client', venue: 'firm', team: 'attorneys',
      offering: 'practice', visit: 'consultation',
    },
  },
  {
    id: 'hotel',
    label: 'Hotel / lodging',
    schemaTypes: ['Hotel', 'LodgingBusiness', 'BedAndBreakfast', 'Resort', 'Motel'],
    keywords: [
      ['hotel', 4], ['boutique hotel', 4], ['resort', 3], ['suites', 2], ['guest rooms', 3],
      ['check-in', 2], ['check in', 1], ['book your stay', 3], ['bed and breakfast', 4],
      ['inn', 1], ['amenities', 1], ['concierge', 2],
    ],
    vocab: {
      customers: 'guests', customer: 'guest', venue: 'property', team: 'front desk',
      offering: 'stay', visit: 'stay',
    },
  },
  {
    id: 'retail',
    label: 'Retail / e-commerce',
    schemaTypes: ['ClothingStore', 'OnlineStore', 'ShoppingCenter'],
    keywords: [
      ['add to cart', 3], ['shop now', 3], ['free shipping', 2], ['checkout', 1],
      ['new arrivals', 3], ['boutique', 2], ['collection', 1], ['in stock', 1],
      ['returns', 1], ['gift card', 1],
    ],
    vocab: {
      customers: 'shoppers', customer: 'shopper', venue: 'store', team: 'store team',
      offering: 'products', visit: 'order',
    },
  },
  {
    id: 'software',
    label: 'Software / SaaS',
    schemaTypes: ['SoftwareApplication', 'WebApplication'],
    keywords: [
      ['saas', 4], ['platform', 2], ['api', 2], ['integrations', 2], ['free trial', 3],
      ['start free', 2], ['request a demo', 3], ['book a demo', 3], ['dashboard', 1],
      ['workflow', 1], ['automation', 1], ['enterprise', 1], ['software', 2],
    ],
    vocab: {
      customers: 'users', customer: 'user', venue: 'company', team: 'team',
      offering: 'product', visit: 'session',
    },
  },
  {
    id: 'agency',
    label: 'Agency / professional services',
    schemaTypes: ['ProfessionalService', 'AccountingService'],
    keywords: [
      ['agency', 3], ['marketing agency', 4], ['creative agency', 4], ['branding', 2],
      ['seo', 2], ['campaigns', 2], ['our work', 2], ['case studies', 2], ['consulting', 2],
      ['accounting', 2], ['bookkeeping', 2],
    ],
    vocab: {
      customers: 'clients', customer: 'client', venue: 'agency', team: 'team',
      offering: 'services', visit: 'engagement',
    },
  },
];

export const GENERIC = {
  id: 'generic',
  label: 'General business',
  schemaTypes: [],
  keywords: [],
  vocab: {
    customers: 'customers', customer: 'customer', venue: 'business', team: 'team',
    offering: 'offering', visit: 'visit',
  },
};

export function profileById(id) {
  return PROFILES.find((p) => p.id === id) || GENERIC;
}

// Serializable view of all profiles, for the UI's manual-override dropdown.
export function publicProfiles() {
  return [...PROFILES, GENERIC].map(({ id, label, vocab }) => ({ id, label, vocab }));
}

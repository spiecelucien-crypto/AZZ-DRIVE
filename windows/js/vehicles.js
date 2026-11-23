// Catalogue de véhicules réels : marque, modèle, gabarit (dimensions approximatives en mètres)
// et signature visuelle (phares, calandre, feux arrière, jantes). Chaque modèle est construit
// à partir d'une silhouette de base (car3d.js) mise à l'échelle de ses vraies dimensions.
//
// Clés de style : f = phares (slim | fang | round), g = calandre (wide | kidney | frame | star | closed),
// r = feux arrière (split | bar | claw | round | vertical | tri), rim = jantes (5 | multi | aero | y),
// roof = 'black' (toit contrasté), ev = électrique (pas d'échappement), o = réglages de forme.

const V = (brand, name, base, L, W, H, s = {}) => ({ brand, name, base, L, W, H, ...s });

const LIST = [
  // Peugeot
  V('Peugeot', '208', 'citadine', 4.06, 1.75, 1.43, { f: 'fang', r: 'claw', rim: 'y' }),
  V('Peugeot', '2008', 'suv', 4.30, 1.77, 1.55, { f: 'fang', r: 'claw', rim: 'y' }),
  V('Peugeot', '308', 'citadine', 4.37, 1.85, 1.44, { f: 'fang', r: 'claw', rim: 'y' }),
  V('Peugeot', '3008', 'suv', 4.54, 1.90, 1.64, { f: 'fang', r: 'bar', rim: 'y' }),
  V('Peugeot', '508', 'berline', 4.75, 1.86, 1.40, { f: 'fang', r: 'bar', rim: 'multi' }),
  V('Peugeot', 'e-208', 'citadine', 4.06, 1.75, 1.43, { f: 'fang', r: 'claw', g: 'closed', ev: true, rim: 'aero' }),
  // Renault
  V('Renault', 'Clio', 'citadine', 4.05, 1.80, 1.44, { r: 'split', rim: 'y' }),
  V('Renault', 'Captur', 'suv', 4.24, 1.80, 1.58, { rim: 'y' }),
  V('Renault', 'Mégane E-Tech', 'suv', 4.20, 1.77, 1.50, { g: 'closed', ev: true, r: 'bar', rim: 'aero' }),
  V('Renault', 'Austral', 'suv', 4.51, 1.83, 1.62, { r: 'bar', rim: 'multi' }),
  V('Renault', 'Scénic E-Tech', 'suv', 4.47, 1.86, 1.57, { g: 'closed', ev: true, rim: 'aero' }),
  V('Renault', '5 E-Tech', 'citadine', 3.92, 1.77, 1.50, { g: 'closed', ev: true, r: 'vertical', rim: 'aero' }),
  V('Renault', 'Kangoo', 'utilitaire', 4.49, 1.86, 1.84, {}),
  V('Renault', 'Trafic', 'utilitaire', 5.08, 1.96, 1.97, {}),
  // Citroën
  V('Citroën', 'C3', 'citadine', 4.01, 1.76, 1.57, { roof: 'black', cladding: true }),
  V('Citroën', 'C4', 'citadine', 4.36, 1.80, 1.52, { r: 'bar' }),
  V('Citroën', 'C5 Aircross', 'suv', 4.50, 1.86, 1.67, { cladding: true }),
  V('Citroën', 'Berlingo', 'utilitaire', 4.40, 1.85, 1.84, {}),
  // Dacia
  V('Dacia', 'Sandero', 'citadine', 4.09, 1.85, 1.50, { r: 'vertical' }),
  V('Dacia', 'Duster', 'suv', 4.34, 1.81, 1.66, { cladding: true, rails: true, r: 'vertical' }),
  V('Dacia', 'Jogger', 'break', 4.55, 1.78, 1.63, { rails: true, r: 'vertical' }),
  V('Dacia', 'Spring', 'citadine', 3.70, 1.58, 1.52, { ev: true, g: 'closed', cladding: true }),
  // Volkswagen
  V('Volkswagen', 'Polo', 'citadine', 4.07, 1.75, 1.45, {}),
  V('Volkswagen', 'Golf', 'citadine', 4.28, 1.79, 1.46, { rim: 'multi' }),
  V('Volkswagen', 'ID.3', 'citadine', 4.26, 1.81, 1.57, { ev: true, g: 'closed', r: 'bar', rim: 'aero', roof: 'black' }),
  V('Volkswagen', 'ID.4', 'suv', 4.58, 1.85, 1.64, { ev: true, g: 'closed', r: 'bar', rim: 'aero' }),
  V('Volkswagen', 'Tiguan', 'suv', 4.54, 1.84, 1.66, { r: 'bar', rails: true }),
  V('Volkswagen', 'Passat', 'break', 4.92, 1.85, 1.50, { r: 'bar', rim: 'multi', rails: true }),
  V('Volkswagen', 'Transporter', 'utilitaire', 5.05, 1.90, 1.97, {}),
  // BMW
  V('BMW', 'Série 1', 'citadine', 4.36, 1.80, 1.46, { g: 'kidney', rim: 'y' }),
  V('BMW', 'Série 3', 'berline', 4.71, 1.83, 1.44, { g: 'kidney', rim: 'y' }),
  V('BMW', 'Série 5', 'berline', 5.06, 1.90, 1.52, { g: 'kidney', r: 'bar', rim: 'multi' }),
  V('BMW', 'X1', 'suv', 4.50, 1.85, 1.64, { g: 'kidney', rim: 'y' }),
  V('BMW', 'X5', 'suv', 4.94, 2.00, 1.76, { g: 'kidney', rim: 'y' }),
  V('BMW', 'i4', 'berline', 4.78, 1.85, 1.45, { g: 'kidney', ev: true, rim: 'aero' }),
  V('BMW', 'M4', 'sportive', 4.80, 1.89, 1.39, { g: 'kidney', rim: 'y' }),
  // Mercedes-Benz
  V('Mercedes-Benz', 'Classe A', 'citadine', 4.42, 1.80, 1.44, { g: 'star', rim: 'multi' }),
  V('Mercedes-Benz', 'Classe C', 'berline', 4.75, 1.82, 1.44, { g: 'star', rim: 'multi' }),
  V('Mercedes-Benz', 'Classe E', 'berline', 4.95, 1.88, 1.47, { g: 'star', r: 'bar', rim: 'multi' }),
  V('Mercedes-Benz', 'GLA', 'suv', 4.41, 1.83, 1.61, { g: 'star' }),
  V('Mercedes-Benz', 'GLC', 'suv', 4.72, 1.89, 1.64, { g: 'star', r: 'bar' }),
  V('Mercedes-Benz', 'Classe G', 'suv', 4.82, 1.93, 1.97, { g: 'star', f: 'round', o: { tumble: 0.03, rearDrop: 0, nose: 1.0, belt: 1.18 } }),
  V('Mercedes-Benz', 'Sprinter', 'utilitaire', 5.93, 2.02, 2.36, { g: 'star' }),
  // Audi
  V('Audi', 'A1', 'citadine', 4.03, 1.74, 1.41, { g: 'frame', roof: 'black' }),
  V('Audi', 'A3', 'citadine', 4.34, 1.82, 1.43, { g: 'frame', rim: 'y' }),
  V('Audi', 'A4 Avant', 'break', 4.76, 1.85, 1.43, { g: 'frame', rim: 'multi', rails: true }),
  V('Audi', 'A6', 'berline', 4.94, 1.89, 1.46, { g: 'frame', r: 'bar', rim: 'multi' }),
  V('Audi', 'Q3', 'suv', 4.48, 1.85, 1.60, { g: 'frame', rim: 'y' }),
  V('Audi', 'Q5', 'suv', 4.68, 1.89, 1.66, { g: 'frame', r: 'bar', rim: 'y' }),
  V('Audi', 'e-tron GT', 'sportive', 4.99, 1.96, 1.40, { g: 'closed', ev: true, r: 'bar', rim: 'aero' }),
  // Tesla
  V('Tesla', 'Model 3', 'berline', 4.72, 1.85, 1.44, { g: 'closed', ev: true, rim: 'aero', o: { trunk: true } }),
  V('Tesla', 'Model Y', 'suv', 4.75, 1.92, 1.62, { g: 'closed', ev: true, rim: 'aero', r: 'bar' }),
  V('Tesla', 'Model S', 'berline', 4.97, 1.96, 1.45, { g: 'closed', ev: true, rim: 'aero' }),
  // Toyota
  V('Toyota', 'Yaris', 'citadine', 3.94, 1.75, 1.50, { r: 'bar', roof: 'black' }),
  V('Toyota', 'Corolla', 'citadine', 4.37, 1.79, 1.44, {}),
  V('Toyota', 'C-HR', 'suv', 4.36, 1.83, 1.56, { r: 'bar', roof: 'black' }),
  V('Toyota', 'RAV4', 'suv', 4.60, 1.86, 1.69, { cladding: true, rails: true }),
  V('Toyota', 'GR86', 'sportive', 4.27, 1.78, 1.31, { spoiler: true, rim: 'y' }),
  // Ford
  V('Ford', 'Fiesta', 'citadine', 4.07, 1.74, 1.48, {}),
  V('Ford', 'Puma', 'suv', 4.21, 1.80, 1.54, {}),
  V('Ford', 'Kuga', 'suv', 4.61, 1.88, 1.68, { rails: true }),
  V('Ford', 'Mustang', 'sportive', 4.81, 1.92, 1.40, { r: 'tri', rim: 'y' }),
  V('Ford', 'Transit', 'utilitaire', 5.53, 2.06, 2.50, {}),
  // Fiat
  V('Fiat', '500', 'citadine', 3.57, 1.63, 1.49, { f: 'round', r: 'round', rim: 'multi' }),
  V('Fiat', 'Panda', 'citadine', 3.69, 1.67, 1.55, { cladding: true, r: 'vertical' }),
  V('Fiat', 'Ducato', 'utilitaire', 5.41, 2.05, 2.25, {}),
  // Mini
  V('Mini', 'Cooper', 'citadine', 3.86, 1.74, 1.43, { f: 'round', r: 'vertical', roof: 'black', o: { tumble: 0.08 } }),
  V('Mini', 'Countryman', 'suv', 4.43, 1.84, 1.66, { f: 'round', r: 'vertical', roof: 'black' }),
  // Kia / Hyundai
  V('Kia', 'Picanto', 'citadine', 3.60, 1.60, 1.49, {}),
  V('Kia', 'Ceed', 'citadine', 4.31, 1.80, 1.45, {}),
  V('Kia', 'Sportage', 'suv', 4.52, 1.87, 1.65, { r: 'bar' }),
  V('Kia', 'Niro', 'suv', 4.42, 1.83, 1.57, { r: 'vertical' }),
  V('Kia', 'EV6', 'suv', 4.68, 1.88, 1.55, { g: 'closed', ev: true, r: 'bar', rim: 'aero' }),
  V('Hyundai', 'i20', 'citadine', 4.04, 1.78, 1.45, { r: 'bar' }),
  V('Hyundai', 'Kona', 'suv', 4.35, 1.83, 1.58, { r: 'bar' }),
  V('Hyundai', 'Tucson', 'suv', 4.50, 1.87, 1.65, { r: 'bar' }),
  V('Hyundai', 'Ioniq 5', 'suv', 4.64, 1.89, 1.61, { g: 'closed', ev: true, r: 'bar', rim: 'aero', o: { tumble: 0.08 } }),
  // Škoda / Seat / Cupra / Opel
  V('Škoda', 'Fabia', 'citadine', 4.11, 1.78, 1.46, {}),
  V('Škoda', 'Octavia Combi', 'break', 4.70, 1.83, 1.47, { rails: true }),
  V('Škoda', 'Kodiaq', 'suv', 4.76, 1.86, 1.68, { rails: true }),
  V('Škoda', 'Enyaq', 'suv', 4.65, 1.88, 1.62, { g: 'closed', ev: true, rim: 'aero' }),
  V('Seat', 'Ibiza', 'citadine', 4.06, 1.78, 1.45, {}),
  V('Cupra', 'Leon', 'citadine', 4.37, 1.80, 1.46, { r: 'bar', rim: 'y' }),
  V('Cupra', 'Formentor', 'suv', 4.45, 1.84, 1.51, { r: 'bar', rim: 'y' }),
  V('Opel', 'Corsa', 'citadine', 4.06, 1.77, 1.43, { roof: 'black' }),
  V('Opel', 'Astra', 'citadine', 4.37, 1.86, 1.44, { r: 'bar' }),
  V('Opel', 'Mokka', 'suv', 4.15, 1.79, 1.53, { roof: 'black' }),
  // Nissan / Volvo / Land Rover
  V('Nissan', 'Juke', 'suv', 4.21, 1.80, 1.59, { roof: 'black' }),
  V('Nissan', 'Qashqai', 'suv', 4.43, 1.84, 1.63, { roof: 'black' }),
  V('Volvo', 'XC40', 'suv', 4.43, 1.86, 1.65, { r: 'vertical', roof: 'black' }),
  V('Volvo', 'XC60', 'suv', 4.71, 1.90, 1.66, { r: 'vertical', rails: true }),
  V('Volvo', 'XC90', 'suv', 4.95, 1.96, 1.78, { r: 'vertical', rails: true }),
  V('Volvo', 'V60', 'break', 4.76, 1.85, 1.43, { r: 'vertical', rails: true }),
  V('Volvo', 'EX30', 'suv', 4.23, 1.84, 1.55, { g: 'closed', ev: true, r: 'vertical', rim: 'aero', roof: 'black' }),
  V('Land Rover', 'Defender', 'suv', 4.76, 2.00, 1.97, { f: 'round', r: 'vertical', roof: 'black', o: { tumble: 0.03, rearDrop: 0, nose: 1.02, belt: 1.2 } }),
  V('Land Rover', 'Range Rover Evoque', 'suv', 4.37, 1.90, 1.65, { r: 'bar', roof: 'black', o: { rearDrop: 0.08 } }),
  // Sportives
  V('Porsche', '911', 'sportive', 4.52, 1.85, 1.30, { f: 'round', r: 'bar', rim: 'multi' }),
  V('Porsche', 'Taycan', 'sportive', 4.96, 1.97, 1.38, { g: 'closed', ev: true, r: 'bar', rim: 'aero' }),
  V('Porsche', 'Macan', 'suv', 4.78, 1.94, 1.62, { r: 'bar', rim: 'multi' }),
  V('Porsche', 'Cayenne', 'suv', 4.93, 1.98, 1.70, { r: 'bar', rim: 'multi' }),
  V('Ferrari', 'Roma', 'sportive', 4.66, 1.97, 1.30, { r: 'round', rim: 'multi' }),
  V('Lamborghini', 'Huracán', 'sportive', 4.52, 1.93, 1.17, { spoiler: true, r: 'bar', rim: 'y' }),
];

export const VEHICLES = Object.fromEntries(LIST.map((v) => [slug(v.brand + '-' + v.name), v]));
for (const [id, v] of Object.entries(VEHICLES)) v.id = id;
export const BRANDS = [...new Set(LIST.map((v) => v.brand))];

export const TYPE_LABEL = { citadine: 'Citadine', berline: 'Berline', break: 'Break', suv: 'SUV', sportive: 'Sportive', utilitaire: 'Utilitaire' };

function slug(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function vehicleLabel(car) {
  const v = car && car.vid && VEHICLES[car.vid];
  return v ? `${v.brand} ${v.name}` : '';
}

export function searchVehicles(q) {
  const s = slug(q || '');
  if (!s) return [];
  return LIST.filter((v) => slug(v.brand + ' ' + v.name).includes(s) || slug(v.name).includes(s)).slice(0, 12);
}

// Paramètres de forme : silhouette de base mise à l'échelle des dimensions réelles du modèle.
const Z_KEYS = ['wheelBase', 'wsBase', 'roofF', 'roofR', 'rgBase', 'nose'];
const Y_KEYS = ['belt', 'tail'];
export function resolveSpec(models, car) {
  const v = car && car.vid && VEHICLES[car.vid];
  const base = models[(v && v.base) || car?.model] || models.citadine;
  if (!v) return { ...base };
  const kL = v.L / base.L, kH = v.H / base.H;
  const p = { ...base, L: v.L, W: v.W, H: v.H };
  for (const k of Z_KEYS) if (k !== 'nose') p[k] = base[k] * kL;
  for (const k of Y_KEYS) p[k] = base.sill + (base[k] - base.sill) * kH;
  p.nose = base.sill + (base.nose - base.sill) * kH;
  p.wheelR = base.wheelR * Math.min(1.1, Math.max(0.92, Math.sqrt(kL * kH)));
  Object.assign(p, {
    front: v.f || 'slim', grille: v.g || 'wide', rear: v.r || 'split', rim: v.rim || null, roofBlack: v.roof === 'black',
    ev: !!v.ev, spoiler: !!v.spoiler, rails: v.rails ?? base.rails, cladding: v.cladding ?? base.cladding,
  }, v.o || {});
  return p;
}

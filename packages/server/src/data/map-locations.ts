// Map locations and elements for Majestic RP

export interface MapLocation {
  id: string;
  name: string;
  type: 'hospital' | 'police' | 'bank' | 'shop' | 'garage' | 'house' | 'business' | 'job' | 'custom';
  position: { x: number; y: number; z: number };
  heading?: number;
  blip: {
    sprite: number;
    color: number;
    scale: number;
    label?: string;
  };
  metadata?: Record<string, any>;
}

export interface MapMarker {
  id: string;
  position: { x: number; y: number; z: number };
  type: 'checkpoint' | 'zone' | 'npc' | 'vehicle_spawn';
  radius?: number;
  data?: Record<string, any>;
}

export const mapLocations: MapLocation[] = [
  // Hospitals
  {
    id: 'hospital_1',
    name: 'Центральная больница',
    type: 'hospital',
    position: { x: 295.83, y: -583.86, z: 43.13 },
    blip: { sprite: 61, color: 2, scale: 1, label: 'Больница' },
    metadata: { respawnPoint: true, healPrice: 500 }
  },
  {
    id: 'hospital_2',
    name: 'Больница Палето Бэй',
    type: 'hospital',
    position: { x: -256.23, y: 6315.56, z: 32.43 },
    blip: { sprite: 61, color: 2, scale: 1, label: 'Больница' },
    metadata: { respawnPoint: true, healPrice: 500 }
  },
  
  // Police Stations
  {
    id: 'police_lspd',
    name: 'LSPD - Полиция',
    type: 'police',
    position: { x: 428.37, y: -981.14, z: 30.71 },
    blip: { sprite: 60, color: 3, scale: 1, label: 'LSPD' },
    metadata: { factionId: 1, armory: true, cells: true }
  },
  {
    id: 'police_sasp',
    name: 'SASP - Шериф',
    type: 'police',
    position: { x: 1855.28, y: 3682.29, z: 34.27 },
    blip: { sprite: 60, color: 3, scale: 1, label: 'SASP' },
    metadata: { factionId: 1, armory: true, cells: true }
  },
  
  // Banks
  {
    id: 'bank_main',
    name: 'Центральный банк',
    type: 'bank',
    position: { x: 235.46, y: 216.38, z: 106.29 },
    blip: { sprite: 108, color: 5, scale: 1, label: 'Банк' },
    metadata: { vault: true, atms: 5 }
  },
  {
    id: 'bank_fleeca',
    name: 'Fleeca Bank',
    type: 'bank',
    position: { x: 149.51, y: -1040.2, z: 29.38 },
    blip: { sprite: 108, color: 5, scale: 1, label: 'Банк' },
    metadata: { vault: true, atms: 3 }
  },
  {
    id: 'bank_maze',
    name: 'Maze Bank',
    type: 'bank',
    position: { x: -75.68, y: -826.99, z: 243.39 },
    blip: { sprite: 108, color: 5, scale: 1, label: 'Банк' },
    metadata: { vault: true, atms: 8 }
  },
  
  // 24/7 Shops
  {
    id: 'shop_247_vinewood',
    name: '24/7 - Vinewood',
    type: 'shop',
    position: { x: 372.58, y: 326.85, z: 103.57 },
    blip: { sprite: 52, color: 4, scale: 0.8, label: '24/7' },
    metadata: { shopType: '247', inventory: ['food', 'drinks', 'snacks'] }
  },
  {
    id: 'shop_247_downtown',
    name: '24/7 - Downtown',
    type: 'shop',
    position: { x: -47.23, y: -1758.68, z: 29.42 },
    blip: { sprite: 52, color: 4, scale: 0.8, label: '24/7' },
    metadata: { shopType: '247', inventory: ['food', 'drinks', 'snacks'] }
  },
  {
    id: 'shop_247_sandy',
    name: '24/7 - Sandy Shores',
    type: 'shop',
    position: { x: 1961.47, y: 3740.67, z: 32.34 },
    blip: { sprite: 52, color: 4, scale: 0.8, label: '24/7' },
    metadata: { shopType: '247', inventory: ['food', 'drinks', 'snacks'] }
  },
  {
    id: 'shop_247_paleto',
    name: '24/7 - Paleto Bay',
    type: 'shop',
    position: { x: -122.69, y: 6555.9, z: 31.43 },
    blip: { sprite: 52, color: 4, scale: 0.8, label: '24/7' },
    metadata: { shopType: '247', inventory: ['food', 'drinks', 'snacks'] }
  },
  
  // Clothing Stores
  {
    id: 'clothing_ponsonbys',
    name: 'Ponsonbys - Премиум одежда',
    type: 'shop',
    position: { x: -710.16, y: -153.38, z: 37.42 },
    blip: { sprite: 73, color: 4, scale: 0.8, label: 'Одежда' },
    metadata: { shopType: 'clothing', premium: true }
  },
  {
    id: 'clothing_suburban',
    name: 'Suburban - Повседневная одежда',
    type: 'shop',
    position: { x: 123.63, y: -226.22, z: 54.23 },
    blip: { sprite: 73, color: 4, scale: 0.8, label: 'Одежда' },
    metadata: { shopType: 'clothing', premium: false }
  },
  {
    id: 'clothing_binoco',
    name: 'Binoco - Дешевая одежда',
    type: 'shop',
    position: { x: 4.31, y: 6511.5, z: 31.83 },
    blip: { sprite: 73, color: 4, scale: 0.8, label: 'Одежда' },
    metadata: { shopType: 'clothing', premium: false }
  },
  
  // Gun Shops
  {
    id: 'gunshop_ammunation',
    name: 'Ammu-Nation - Оружие',
    type: 'shop',
    position: { x: 22.09, y: -1107.28, z: 29.8 },
    blip: { sprite: 110, color: 1, scale: 0.8, label: 'Оружие' },
    metadata: { shopType: 'gunshop', requiresLicense: true }
  },
  {
    id: 'gunshop_vinewood',
    name: 'Ammu-Nation - Vinewood',
    type: 'shop',
    position: { x: 842.44, y: -1033.42, z: 28.19 },
    blip: { sprite: 110, color: 1, scale: 0.8, label: 'Оружие' },
    metadata: { shopType: 'gunshop', requiresLicense: true }
  },
  
  // Garages
  {
    id: 'garage_impound',
    name: 'Штрафстоянка',
    type: 'garage',
    position: { x: 402.03, y: -1628.33, z: 29.29 },
    blip: { sprite: 50, color: 6, scale: 1, label: 'Штрафстоянка' },
    metadata: { garageType: 'impound', maxVehicles: 50 }
  },
  {
    id: 'garage_pillbox',
    name: 'Гараж Pillbox',
    type: 'garage',
    position: { x: 215.84, y: -809.86, z: 31.03 },
    blip: { sprite: 50, color: 6, scale: 0.8, label: 'Гараж' },
    metadata: { garageType: 'public', maxVehicles: 20, price: 50000 }
  },
  {
    id: 'garage_sandy',
    name: 'Гараж Sandy Shores',
    type: 'garage',
    position: { x: 1737.84, y: 3710.84, z: 34.14 },
    blip: { sprite: 50, color: 6, scale: 0.8, label: 'Гараж' },
    metadata: { garageType: 'public', maxVehicles: 15, price: 35000 }
  },
  
  // Job Locations
  {
    id: 'job_taxi',
    name: 'Такси - Автопарк',
    type: 'job',
    position: { x: 892.52, y: -179.35, z: 74.7 },
    blip: { sprite: 56, color: 5, scale: 1, label: 'Такси' },
    metadata: { jobCode: 'taxi', baseSalary: 280 }
  },
  {
    id: 'job_mechanic',
    name: 'Механик - СТО',
    type: 'job',
    position: { x: -342.31, y: -136.93, z: 39.01 },
    blip: { sprite: 446, color: 17, scale: 1, label: 'Механик' },
    metadata: { jobCode: 'mechanic', baseSalary: 330 }
  },
  {
    id: 'job_trucker',
    name: 'Дальнобойщик - Склад',
    type: 'job',
    position: { x: 1191.95, y: -3301.43, z: 5.53 },
    blip: { sprite: 477, color: 5, scale: 1, label: 'Склад' },
    metadata: { jobCode: 'trucker', baseSalary: 450 }
  },
  {
    id: 'job_medic',
    name: 'Медик - EMS',
    type: 'job',
    position: { x: 295.83, y: -583.86, z: 43.13 },
    blip: { sprite: 61, color: 1, scale: 1, label: 'EMS' },
    metadata: { jobCode: 'medic', baseSalary: 360 }
  },
  {
    id: 'job_police',
    name: 'Полиция - LSPD',
    type: 'job',
    position: { x: 428.37, y: -981.14, z: 30.71 },
    blip: { sprite: 60, color: 3, scale: 1, label: 'LSPD' },
    metadata: { jobCode: 'police', baseSalary: 500 }
  },
  
  // Custom Locations
  {
    id: 'custom_car_dealer',
    name: 'Автосалон Premium',
    type: 'custom',
    position: { x: -33.74, y: -1102.46, z: 26.42 },
    blip: { sprite: 225, color: 5, scale: 1, label: 'Автосалон' },
    metadata: { dealerType: 'premium', vehicles: ['sports', 'super', 'muscle'] }
  },
  {
    id: 'custom_car_dealer_cheap',
    name: 'Автосалон Бюджет',
    type: 'custom',
    position: { x: -56.6, y: -1098.08, z: 26.42 },
    blip: { sprite: 225, color: 5, scale: 1, label: 'Автосалон' },
    metadata: { dealerType: 'economy', vehicles: ['sedan', 'coupe', 'suv'] }
  },
  {
    id: 'custom_airport',
    name: 'Аэропорт LSIA',
    type: 'custom',
    position: { x: -1039.95, y: -2737.66, z: 20.17 },
    blip: { sprite: 90, color: 5, scale: 1, label: 'Аэропорт' },
    metadata: { hasHangars: true, runway: true }
  },
  {
    id: 'custom_port',
    name: 'Порт LS',
    type: 'custom',
    position: { x: 739.54, y: -1398.73, z: 26.62 },
    blip: { sprite: 355, color: 5, scale: 1, label: 'Порт' },
    metadata: { hasDocks: true, fishing: true }
  }
];

export const mapMarkers: MapMarker[] = [
  // Safe Zones
  {
    id: 'safezone_hospital',
    position: { x: 295.83, y: -583.86, z: 43.13 },
    type: 'zone',
    radius: 50,
    data: { type: 'safezone', noWeapons: true, noCrime: true }
  },
  {
    id: 'safezone_police',
    position: { x: 428.37, y: -981.14, z: 30.71 },
    type: 'zone',
    radius: 60,
    data: { type: 'safezone', noWeapons: true, noCrime: true }
  },
  
  // NPC Checkpoints
  {
    id: 'npc_shop_247_1',
    position: { x: 372.58, y: 326.85, z: 103.57 },
    type: 'npc',
    data: { shopId: 'shop_247_vinewood', model: 's_m_m_linecook' }
  },
  {
    id: 'npc_shop_247_2',
    position: { x: -47.23, y: -1758.68, z: 29.42 },
    type: 'npc',
    data: { shopId: 'shop_247_downtown', model: 's_m_m_linecook' }
  },
  {
    id: 'npc_gunshop_1',
    position: { x: 22.09, y: -1107.28, z: 29.8 },
    type: 'npc',
    data: { shopId: 'gunshop_ammunation', model: 's_m_m_ammucity_01' }
  },
  
  // Vehicle Spawn Points
  {
    id: 'spawn_police',
    position: { x: 428.37, y: -981.14, z: 30.71 },
    type: 'vehicle_spawn',
    data: { factionId: 1, vehicles: ['police', 'police2', 'police3'] }
  },
  {
    id: 'spawn_ems',
    position: { x: 295.83, y: -583.86, z: 43.13 },
    type: 'vehicle_spawn',
    data: { factionId: 2, vehicles: ['ambulance', 'ambulance2'] }
  },
  {
    id: 'spawn_taxi',
    position: { x: 892.52, y: -179.35, z: 74.7 },
    type: 'vehicle_spawn',
    data: { jobCode: 'taxi', vehicles: ['taxi'] }
  }
];

export const mapZones = [
  // Downtown LS
  {
    id: 'zone_downtown',
    name: 'Downtown Los Santos',
    type: 'city',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 500, y: 500 },
    properties: { crimeRate: 'medium', policePresence: 'high' }
  },
  // Vinewood
  {
    id: 'zone_vinewood',
    name: 'Vinewood Hills',
    type: 'residential',
    position: { x: 500, y: 500, z: 0 },
    size: { x: 400, y: 400 },
    properties: { crimeRate: 'low', policePresence: 'medium' }
  },
  // Sandy Shores
  {
    id: 'zone_sandy',
    name: 'Sandy Shores',
    type: 'town',
    position: { x: 1800, y: 3700, z: 0 },
    size: { x: 600, y: 600 },
    properties: { crimeRate: 'medium', policePresence: 'low' }
  },
  // Paleto Bay
  {
    id: 'zone_paleto',
    name: 'Paleto Bay',
    type: 'town',
    position: { x: 0, y: 6500, z: 0 },
    size: { x: 500, y: 500 },
    properties: { crimeRate: 'low', policePresence: 'medium' }
  }
];

export function getMapLocationById(id: string): MapLocation | undefined {
  return mapLocations.find(loc => loc.id === id);
}

export function getMapLocationsByType(type: MapLocation['type']): MapLocation[] {
  return mapLocations.filter(loc => loc.type === type);
}

export function getMapLocationsInRadius(
  position: { x: number; y: number; z: number },
  radius: number
): MapLocation[] {
  return mapLocations.filter(loc => {
    const distance = Math.sqrt(
      Math.pow(loc.position.x - position.x, 2) +
      Math.pow(loc.position.y - position.y, 2) +
      Math.pow(loc.position.z - position.z, 2)
    );
    return distance <= radius;
  });
}

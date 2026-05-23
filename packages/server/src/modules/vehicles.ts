import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { config } from "../config.js";
import { getFactionMembershipByCharacterId } from "../faction-context.js";

type AccessGroup = "civilian" | "government" | "crime" | "gang" | "job:taxi" | "job:medic" | "job:mechanic" | "job:tow";
type VehicleRegion = "EU" | "RU" | "CIS" | "DE";

type CatalogVehicle = {
  modelCode: string;
  displayName: string;
  brand: string;
  price: number;
  tier: "economy" | "comfort" | "sport" | "super" | "service" | "government" | "crime" | "premium";
  regions: VehicleRegion[];
  access: AccessGroup[];
  minRankCode?: string;
};

const catalogVehicles: CatalogVehicle[] = [
  { modelCode: "blista", displayName: "Blista", brand: "Dinka", price: 65000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "futo", displayName: "Futo", brand: "Karin", price: 98000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "sultan", displayName: "Sultan", brand: "Karin", price: 145000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "buffalo", displayName: "Buffalo", brand: "Bravado", price: 210000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tailgater", displayName: "Tailgater", brand: "Obey", price: 185000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "schafter2", displayName: "Schafter V12", brand: "Benefactor", price: 310000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "oracle2", displayName: "Oracle XS", brand: "Ubermacht", price: 275000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "sentinel", displayName: "Sentinel", brand: "Ubermacht", price: 230000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "jugular", displayName: "Jugular", brand: "Ocelot", price: 450000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "komoda", displayName: "Komoda", brand: "Lampadati", price: 420000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "euros", displayName: "Euros", brand: "Annis", price: 390000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "jester", displayName: "Jester", brand: "Dinka", price: 470000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "comet2", displayName: "Comet", brand: "Pfister", price: 520000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "ninef", displayName: "9F", brand: "Obey", price: 550000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "feltzer2", displayName: "Feltzer", brand: "Benefactor", price: 480000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "zentorno", displayName: "Zentorno", brand: "Pegassi", price: 1500000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "t20", displayName: "T20", brand: "Progen", price: 1750000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "krieger", displayName: "Krieger", brand: "Benefactor", price: 2200000, tier: "super", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "emerus", displayName: "Emerus", brand: "Progen", price: 2400000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "italirsx", displayName: "Itali RSX", brand: "Grotti", price: 2600000, tier: "super", regions: ["EU"], access: ["civilian"] },

  { modelCode: "issi2", displayName: "Lada 2107 Style", brand: "RetroRU", price: 55000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "asbo", displayName: "Lada Vesta Style", brand: "RetroRU", price: 115000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "asterope", displayName: "Toyota Camry Style", brand: "Asian", price: 135000, tier: "comfort", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "premier", displayName: "BMW 5 Style", brand: "Euro", price: 260000, tier: "comfort", regions: ["RU", "CIS", "DE"], access: ["civilian"] },
  { modelCode: "fugitive", displayName: "Skoda Superb Style", brand: "Euro", price: 180000, tier: "comfort", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "stanier", displayName: "Volga Style", brand: "RetroRU", price: 90000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "stratum", displayName: "Subaru Legacy Style", brand: "JP", price: 165000, tier: "comfort", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "kuruma", displayName: "Kuruma", brand: "Karin", price: 320000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "elegy", displayName: "Elegy RH8", brand: "Annis", price: 340000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "neon", displayName: "Neon", brand: "Pfister", price: 620000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "prairie", displayName: "Prairie", brand: "Bollokan", price: 45000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "rhapsody", displayName: "Rhapsody", brand: "Declasse", price: 38000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "dilettante", displayName: "Dilettante", brand: "Karin", price: 52000, tier: "economy", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "issi3", displayName: "Issi Classic", brand: "Weeny", price: 49000, tier: "economy", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "brioso", displayName: "Brioso R/A", brand: "Grotti", price: 76000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "kanjo", displayName: "Blista Kanjo", brand: "Dinka", price: 88000, tier: "economy", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "club", displayName: "Club", brand: "BF", price: 92000, tier: "economy", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "postlude", displayName: "Postlude", brand: "Dinka", price: 130000, tier: "sport", regions: ["EU", "RU"], access: ["civilian"] },
  { modelCode: "remus", displayName: "Remus", brand: "Annis", price: 185000, tier: "sport", regions: ["EU", "RU", "CIS"], access: ["civilian"] },
  { modelCode: "rt3000", displayName: "RT3000", brand: "Dinka", price: 255000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "sugoi", displayName: "Sugoi", brand: "Dinka", price: 295000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "vstr", displayName: "V-STR", brand: "Albany", price: 360000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "cogcabrio", displayName: "Cognoscenti Cabrio", brand: "Enus", price: 340000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "washington", displayName: "Washington", brand: "Albany", price: 125000, tier: "comfort", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "ingot", displayName: "Ingot", brand: "Vulcar", price: 118000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "jackal", displayName: "Jackal", brand: "Ocelot", price: 215000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "zion", displayName: "Zion", brand: "Ubermacht", price: 205000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "zion2", displayName: "Zion Cabrio", brand: "Ubermacht", price: 235000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "felon", displayName: "Felon", brand: "Lampadati", price: 270000, tier: "comfort", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "felon2", displayName: "Felon GT", brand: "Lampadati", price: 300000, tier: "comfort", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "f620", displayName: "F620", brand: "Ocelot", price: 315000, tier: "comfort", regions: ["EU"], access: ["civilian"] },
  { modelCode: "cognoscenti", displayName: "Cognoscenti", brand: "Enus", price: 470000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "cognoscenti2", displayName: "Cognoscenti 55", brand: "Enus", price: 540000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "superd", displayName: "Super Diamond", brand: "Enus", price: 690000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "stafford", displayName: "Stafford", brand: "Enus", price: 760000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "windsor", displayName: "Windsor", brand: "Enus", price: 840000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "windsor2", displayName: "Windsor Drop", brand: "Enus", price: 980000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "xls", displayName: "XLS", brand: "Benefactor", price: 620000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "toros", displayName: "Toros", brand: "Pegassi", price: 720000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "novak", displayName: "Novak", brand: "Lampadati", price: 690000, tier: "premium", regions: ["EU", "DE"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "rebla", displayName: "Rebla GTS", brand: "Ubermacht", price: 830000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "landstalker2", displayName: "Landstalker XL", brand: "Dundreary", price: 560000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "huntley", displayName: "Huntley S", brand: "Enus", price: 510000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "fq2", displayName: "FQ2", brand: "Fathom", price: 265000, tier: "comfort", regions: ["EU"], access: ["civilian"] },
  { modelCode: "rocoto", displayName: "Rocoto", brand: "Obey", price: 350000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "seminole2", displayName: "Seminole Frontier", brand: "Canis", price: 170000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "granger2", displayName: "Granger 3600LX", brand: "Declasse", price: 470000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "patriot2", displayName: "Patriot Stretch", brand: "Mammoth", price: 1200000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "deity", displayName: "Deity", brand: "Enus", price: 1500000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "jubilee", displayName: "Jubilee", brand: "Enus", price: 1700000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "sm722", displayName: "SM722", brand: "Benefactor", price: 2100000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "tenf", displayName: "10F", brand: "Obey", price: 1350000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "tenf2", displayName: "10F Widebody", brand: "Obey", price: 1680000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "drafter", displayName: "8F Drafter", brand: "Obey", price: 970000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "paragon2", displayName: "Paragon R Armored", brand: "Enus", price: 1850000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "growler", displayName: "Growler", brand: "Pfister", price: 1240000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "comet6", displayName: "Comet S2", brand: "Pfister", price: 1480000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "comet7", displayName: "Comet S2 Cabrio", brand: "Pfister", price: 1620000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "cypher", displayName: "Cypher", brand: "Ubermacht", price: 980000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "vectre", displayName: "Vectre", brand: "Emperor", price: 1020000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "calico", displayName: "Calico GTF", brand: "Karin", price: 930000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "futo2", displayName: "Futo GTX", brand: "Karin", price: 780000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "zr350", displayName: "ZR350", brand: "Annis", price: 840000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "warrener2", displayName: "Warrener HKR", brand: "Vulcar", price: 530000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "kanjosj", displayName: "Kanjo SJ", brand: "Dinka", price: 410000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "postlude2", displayName: "Postlude Tuner", brand: "Dinka", price: 470000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "dominator8", displayName: "Dominator ASP", brand: "Vapid", price: 660000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "dominator7", displayName: "Dominator GTT", brand: "Vapid", price: 610000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "dominator3", displayName: "Dominator GTX", brand: "Vapid", price: 720000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "gauntlet5", displayName: "Gauntlet Hellfire", brand: "Bravado", price: 760000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "gauntlet3", displayName: "Gauntlet Classic Custom", brand: "Bravado", price: 820000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "vigero2", displayName: "Vigero ZX", brand: "Declasse", price: 980000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "ruiner4", displayName: "Ruiner ZZ-8", brand: "Imponte", price: 740000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "coquette4", displayName: "Coquette D10", brand: "Invetero", price: 1260000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "corsita", displayName: "Corsita", brand: "Lampadati", price: 1820000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "italigto", displayName: "Itali GTO", brand: "Grotti", price: 1950000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "italigtb", displayName: "Itali GTB", brand: "Progen", price: 2050000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "italigtb2", displayName: "Itali GTB Custom", brand: "Progen", price: 2350000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "thrax", displayName: "Thrax", brand: "Truffade", price: 2650000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "nero", displayName: "Nero", brand: "Truffade", price: 2450000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "nero2", displayName: "Nero Custom", brand: "Truffade", price: 2850000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "entity2", displayName: "Entity XXR", brand: "Overflod", price: 2300000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "entity3", displayName: "Entity MT", brand: "Overflod", price: 3200000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tyrant", displayName: "Tyrant", brand: "Overflod", price: 2550000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "taipan", displayName: "Taipan", brand: "Cheval", price: 2750000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "osiris", displayName: "Osiris", brand: "Pegassi", price: 2250000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "reaper", displayName: "Reaper", brand: "Pegassi", price: 2100000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "zorusso", displayName: "Zorrusso", brand: "Pegassi", price: 2480000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "turismor", displayName: "Turismo R", brand: "Grotti", price: 1750000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "infernus2", displayName: "Infernus Classic", brand: "Pegassi", price: 980000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "cheetah2", displayName: "Cheetah Classic", brand: "Grotti", price: 1080000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "adder", displayName: "Adder", brand: "Truffade", price: 3000000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "fmj", displayName: "FMJ", brand: "Vapid", price: 2850000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "xa21", displayName: "XA-21", brand: "Ocelot", price: 2750000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tezeract", displayName: "Tezeract", brand: "Pegassi", price: 3400000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "cyclone", displayName: "Cyclone", brand: "Coil", price: 2900000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "ignus", displayName: "Ignus", brand: "Pegassi", price: 3600000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "torero2", displayName: "Torero XO", brand: "Pegassi", price: 3550000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "lm87", displayName: "LM87", brand: "Benefactor", price: 3800000, tier: "super", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "virtue", displayName: "Virtue", brand: "Ocelot", price: 4100000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "entityxf", displayName: "Entity XF", brand: "Overflod", price: 2500000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "vacca", displayName: "Vacca", brand: "Pegassi", price: 1680000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "bullet", displayName: "Bullet", brand: "Vapid", price: 1450000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "massacro", displayName: "Massacro", brand: "Dewbauchee", price: 920000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "massacro2", displayName: "Massacro Race", brand: "Dewbauchee", price: 980000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "rapidgt", displayName: "Rapid GT", brand: "Dewbauchee", price: 830000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "rapidgt2", displayName: "Rapid GT Cabrio", brand: "Dewbauchee", price: 860000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "seven70", displayName: "Seven-70", brand: "Dewbauchee", price: 920000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "lynx", displayName: "Lynx", brand: "Ocelot", price: 760000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "omnis", displayName: "Omnis", brand: "Obey", price: 690000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "raiden", displayName: "Raiden", brand: "Coil", price: 980000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "surano", displayName: "Surano", brand: "Benefactor", price: 670000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "carbonizzare", displayName: "Carbonizzare", brand: "Grotti", price: 780000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "coquette", displayName: "Coquette", brand: "Invetero", price: 730000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "banshee", displayName: "Banshee", brand: "Bravado", price: 680000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "banshee2", displayName: "Banshee 900R", brand: "Bravado", price: 1250000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "feltzer3", displayName: "Stirling GT", brand: "Benefactor", price: 1340000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "casco", displayName: "Casco", brand: "Lampadati", price: 960000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "ztype", displayName: "Z-Type", brand: "Truffade", price: 1880000, tier: "premium", regions: ["EU", "DE"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "ardent", displayName: "Ardent", brand: "Ocelot", price: 1320000, tier: "premium", regions: ["EU", "DE"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "mamba", displayName: "Mamba", brand: "Declasse", price: 1460000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "torero", displayName: "Torero", brand: "Pegassi", price: 1540000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "viseris", displayName: "Viseris", brand: "Lampadati", price: 1180000, tier: "premium", regions: ["EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "savestra", displayName: "Savestra", brand: "Annis", price: 880000, tier: "premium", regions: ["EU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "cheburek", displayName: "Cheburek", brand: "RUNE", price: 155000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "nebula", displayName: "Nebula Turbo", brand: "Vulcar", price: 280000, tier: "comfort", regions: ["RU", "CIS", "DE"], access: ["civilian"] },
  { modelCode: "retinue2", displayName: "Retinue Mk II", brand: "Vapid", price: 340000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "weevil", displayName: "Weevil", brand: "BF", price: 140000, tier: "economy", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "weevil2", displayName: "Weevil Custom", brand: "BF", price: 420000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "brioso2", displayName: "Brioso 300", brand: "Grotti", price: 118000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tulip", displayName: "Tulip", brand: "Declasse", price: 330000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tulip2", displayName: "Tulip M-100", brand: "Declasse", price: 540000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "vamos", displayName: "Vamos", brand: "Declasse", price: 390000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "greenwood", displayName: "Greenwood", brand: "Bravado", price: 460000, tier: "comfort", regions: ["EU", "RU"], access: ["civilian"] },
  { modelCode: "buffalo4", displayName: "Buffalo STX", brand: "Bravado", price: 1150000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "omnisegt", displayName: "Omnis e-GT", brand: "Obey", price: 1350000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "astron", displayName: "Astron", brand: "Pfister", price: 1280000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "iwagen", displayName: "I-Wagen", brand: "Obey", price: 980000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "torero3", displayName: "Torero Performance", brand: "Pegassi", price: 3300000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "champion", displayName: "Champion", brand: "Dewbauchee", price: 2900000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "furia", displayName: "Furia", brand: "Grotti", price: 3050000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "penetrator", displayName: "Penetrator", brand: "Ocelot", price: 2150000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "le7b", displayName: "RE-7B", brand: "Annis", price: 3250000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "autarch", displayName: "Autarch", brand: "Overflod", price: 2980000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "gp1", displayName: "GP1", brand: "Progen", price: 2420000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "tyrus", displayName: "Tyrus", brand: "Progen", price: 2800000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "voltic", displayName: "Voltic", brand: "Coil", price: 890000, tier: "sport", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "surfer", displayName: "Surfer", brand: "BF", price: 42000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "youga", displayName: "Youga", brand: "Bravado", price: 82000, tier: "economy", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "youga3", displayName: "Youga Classic 4x4", brand: "Bravado", price: 240000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "bison", displayName: "Bison", brand: "Bravado", price: 155000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "bobcatxl", displayName: "Bobcat XL", brand: "Vapid", price: 170000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "sadler", displayName: "Sadler", brand: "Vapid", price: 145000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "riata", displayName: "Riata", brand: "Vapid", price: 310000, tier: "comfort", regions: ["EU"], access: ["civilian"] },
  { modelCode: "mesa", displayName: "Mesa", brand: "Canis", price: 220000, tier: "comfort", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "kamacho", displayName: "Kamacho", brand: "Canis", price: 460000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "caracara2", displayName: "Caracara 4x4", brand: "Vapid", price: 540000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "dubsta", displayName: "Dubsta", brand: "Benefactor", price: 340000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "dubsta2", displayName: "Dubsta Lux", brand: "Benefactor", price: 490000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "dubsta3", displayName: "Dubsta 6x6", brand: "Benefactor", price: 810000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "contender", displayName: "Contender", brand: "Vapid", price: 420000, tier: "comfort", regions: ["EU"], access: ["civilian"] },
  { modelCode: "baller", displayName: "Baller", brand: "Gallivanter", price: 390000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "baller2", displayName: "Baller II", brand: "Gallivanter", price: 430000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "baller3", displayName: "Baller LE", brand: "Gallivanter", price: 620000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "baller4", displayName: "Baller LE LWB", brand: "Gallivanter", price: 680000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "bestiagts", displayName: "Bestia GTS", brand: "Grotti", price: 770000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "alpha", displayName: "Alpha", brand: "Albany", price: 520000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "verlierer2", displayName: "Verlierer", brand: "Bravado", price: 730000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "neon2", displayName: "Neon Sport", brand: "Pfister", price: 1180000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "s95", displayName: "S95", brand: "Karin", price: 980000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "rt3001", displayName: "RT3000 Plus", brand: "Dinka", price: 440000, tier: "sport", regions: ["EU", "CIS"], access: ["civilian"] },
  { modelCode: "penumbra", displayName: "Penumbra", brand: "Maibatsu", price: 290000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "penumbra2", displayName: "Penumbra FF", brand: "Maibatsu", price: 620000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "schafter3", displayName: "Schafter LWB", brand: "Benefactor", price: 510000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "schafter4", displayName: "Schafter LWB Armor", brand: "Benefactor", price: 940000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "surge", displayName: "Surge", brand: "Cheval", price: 160000, tier: "comfort", regions: ["EU"], access: ["civilian"] },
  { modelCode: "intruder", displayName: "Intruder", brand: "Karin", price: 145000, tier: "comfort", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "regina", displayName: "Regina", brand: "Dundreary", price: 68000, tier: "economy", regions: ["EU"], access: ["civilian"] },
  { modelCode: "asea2", displayName: "Asea Sport", brand: "Declasse", price: 98000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "glendale", displayName: "Glendale", brand: "Benefactor", price: 190000, tier: "comfort", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "glendale2", displayName: "Glendale Custom", brand: "Benefactor", price: 360000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "manana2", displayName: "Manana Custom", brand: "Albany", price: 270000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "peyote2", displayName: "Peyote Gasser", brand: "Vapid", price: 490000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "ruiner2", displayName: "Ruiner 2000 Style", brand: "Imponte", price: 1100000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "komoda2", displayName: "Komoda RS", brand: "Lampadati", price: 780000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "sultan3", displayName: "Sultan Classic", brand: "Karin", price: 470000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "sultan2", displayName: "Sultan Classic RS", brand: "Karin", price: 920000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "sentinel3", displayName: "Sentinel Classic", brand: "Ubermacht", price: 390000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "sentinel4", displayName: "Sentinel Widebody", brand: "Ubermacht", price: 820000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "euros2", displayName: "Euros X32", brand: "Annis", price: 1020000, tier: "sport", regions: ["EU"], access: ["civilian"] },
  { modelCode: "gtrxx", displayName: "GT-R XX (Street Build)", brand: "JDM", price: 1450000, tier: "sport", regions: ["RU", "CIS", "EU"], access: ["civilian"] },
  { modelCode: "m5cs", displayName: "M5 CS Style", brand: "DE-Performance", price: 1850000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "amg63", displayName: "AMG 63 Style", brand: "DE-Performance", price: 1920000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "rs7", displayName: "RS7 Style", brand: "DE-Performance", price: 1780000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "x5m", displayName: "X5M Style", brand: "DE-Performance", price: 1650000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "g63", displayName: "G63 Style", brand: "DE-Performance", price: 2350000, tier: "premium", regions: ["DE", "RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "sclass", displayName: "S-Class Style", brand: "DE-Lux", price: 1750000, tier: "premium", regions: ["DE", "RU", "CIS", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "maybach", displayName: "Maybach Style", brand: "DE-Lux", price: 2900000, tier: "premium", regions: ["DE", "RU", "CIS", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "urus", displayName: "Urus Style", brand: "EU-Lux", price: 2400000, tier: "premium", regions: ["EU", "RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "cullinan", displayName: "Cullinan Style", brand: "DE-Lux", price: 3200000, tier: "premium", regions: ["DE", "RU", "CIS", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "chiron", displayName: "Chiron Style", brand: "EU-Hyper", price: 6500000, tier: "super", regions: ["EU", "DE"], access: ["civilian"] },
  { modelCode: "aventador", displayName: "Aventador Style", brand: "EU-Hyper", price: 5200000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "huracan", displayName: "Huracan Style", brand: "EU-Hyper", price: 4700000, tier: "super", regions: ["EU"], access: ["civilian"] },
  { modelCode: "gt63", displayName: "GT 63 Style", brand: "DE-Performance", price: 2650000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "rs6", displayName: "RS6 Style", brand: "DE-Performance", price: 2250000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "e63", displayName: "E63 Style", brand: "DE-Performance", price: 1980000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "a45", displayName: "A45 Style", brand: "DE-Performance", price: 1240000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "m3g80", displayName: "M3 G80 Style", brand: "DE-Performance", price: 1720000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "m4", displayName: "M4 Style", brand: "DE-Performance", price: 1820000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "c63s", displayName: "C63S Style", brand: "DE-Performance", price: 1680000, tier: "sport", regions: ["DE", "EU"], access: ["civilian"] },
  { modelCode: "panamera", displayName: "Panamera Style", brand: "DE-Lux", price: 2100000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "taycan", displayName: "Taycan Style", brand: "DE-Lux", price: 2050000, tier: "premium", regions: ["DE", "EU"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "vesta", displayName: "Vesta Sport Style", brand: "RU-Motors", price: 320000, tier: "comfort", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "priora", displayName: "Priora Style", brand: "RU-Motors", price: 110000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "granta", displayName: "Granta Style", brand: "RU-Motors", price: 78000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "xray", displayName: "XRAY Style", brand: "RU-Motors", price: 150000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "uaz", displayName: "UAZ Style", brand: "RU-Motors", price: 210000, tier: "comfort", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "niva", displayName: "Niva Style", brand: "RU-Motors", price: 125000, tier: "economy", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "patriotru", displayName: "Patriot Style", brand: "RU-Motors", price: 195000, tier: "comfort", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "gazelle", displayName: "Gazelle Style", brand: "RU-Motors", price: 175000, tier: "comfort", regions: ["RU", "CIS"], access: ["civilian"] },
  { modelCode: "camry70", displayName: "Camry 70 Style", brand: "JP-RU", price: 890000, tier: "premium", regions: ["RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "landcruiser", displayName: "Land Cruiser Style", brand: "JP-RU", price: 1600000, tier: "premium", regions: ["RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "lx570", displayName: "LX 570 Style", brand: "JP-RU", price: 1850000, tier: "premium", regions: ["RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "gx460", displayName: "GX 460 Style", brand: "JP-RU", price: 1320000, tier: "premium", regions: ["RU", "CIS"], access: ["civilian"] as AccessGroup[] },
  { modelCode: "rx350", displayName: "RX 350 Style", brand: "JP-RU", price: 1160000, tier: "premium", regions: ["RU", "CIS"], access: ["civilian"] as AccessGroup[] },

  { modelCode: "police3", displayName: "Police Interceptor", brand: "Vapid", price: 0, tier: "government", regions: ["EU", "DE"], access: ["government"], minRankCode: "member" },
  { modelCode: "fbi", displayName: "FIB Buffalo", brand: "Bravado", price: 0, tier: "government", regions: ["EU", "DE"], access: ["government"], minRankCode: "officer" },
  { modelCode: "riot", displayName: "Riot Van", brand: "Brute", price: 0, tier: "government", regions: ["EU"], access: ["government"], minRankCode: "sergeant" },
  { modelCode: "policeb", displayName: "Police Bike", brand: "Western", price: 0, tier: "government", regions: ["EU"], access: ["government"], minRankCode: "member" },
  { modelCode: "policet", displayName: "Police Transporter", brand: "Vapid", price: 0, tier: "government", regions: ["EU"], access: ["government"], minRankCode: "officer" },
  { modelCode: "ambulance", displayName: "Ambulance", brand: "Brute", price: 0, tier: "service", regions: ["EU", "DE"], access: ["government", "job:medic"], minRankCode: "member" },
  { modelCode: "firetruk", displayName: "Fire Truck", brand: "MTL", price: 0, tier: "service", regions: ["EU"], access: ["government"], minRankCode: "sergeant" },
  { modelCode: "pranger", displayName: "Pranger SUV", brand: "Declasse", price: 0, tier: "government", regions: ["EU", "DE"], access: ["government"], minRankCode: "officer" },
  { modelCode: "baller6", displayName: "Government SUV", brand: "Gallivanter", price: 0, tier: "government", regions: ["EU", "DE"], access: ["government"], minRankCode: "captain" },
  { modelCode: "schafter6", displayName: "Executive Gov Sedan", brand: "Benefactor", price: 0, tier: "government", regions: ["DE", "EU"], access: ["government"], minRankCode: "chief" },
  { modelCode: "paragon", displayName: "Paragon R (Gov Sport)", brand: "Enus", price: 0, tier: "government", regions: ["EU", "DE"], access: ["government"], minRankCode: "captain" },
  { modelCode: "rebla", displayName: "Rebla GTS (Gov Sport SUV)", brand: "Ubermacht", price: 0, tier: "government", regions: ["DE", "EU"], access: ["government"], minRankCode: "captain" },

  { modelCode: "sultanrs", displayName: "Sultan RS (Crime)", brand: "Karin", price: 0, tier: "crime", regions: ["EU", "RU", "CIS"], access: ["crime", "gang"], minRankCode: "member" },
  { modelCode: "schlagen", displayName: "Schlagen GT", brand: "Benefactor", price: 0, tier: "crime", regions: ["DE", "EU"], access: ["crime", "gang"], minRankCode: "member" },
  { modelCode: "jugular2", displayName: "Jugular Custom", brand: "Ocelot", price: 0, tier: "crime", regions: ["EU"], access: ["crime", "gang"], minRankCode: "officer" },
  { modelCode: "gauntlet4", displayName: "Gauntlet Classic", brand: "Bravado", price: 0, tier: "crime", regions: ["EU"], access: ["crime", "gang"], minRankCode: "member" },
  { modelCode: "nightshade", displayName: "Nightshade", brand: "Imponte", price: 0, tier: "crime", regions: ["EU"], access: ["crime", "gang"], minRankCode: "officer" },
  { modelCode: "xls2", displayName: "Armored SUV", brand: "Enus", price: 0, tier: "crime", regions: ["EU", "RU"], access: ["crime", "gang"], minRankCode: "sergeant" },
  { modelCode: "kuruma2", displayName: "Kuruma Armored", brand: "Karin", price: 0, tier: "crime", regions: ["RU", "CIS", "EU"], access: ["crime", "gang"], minRankCode: "member" },
  { modelCode: "btype", displayName: "Classic Gang Car", brand: "Albany", price: 0, tier: "crime", regions: ["EU"], access: ["gang"], minRankCode: "member" },
  { modelCode: "buccaneer2", displayName: "Buccaneer Custom", brand: "Albany", price: 0, tier: "crime", regions: ["EU"], access: ["gang"], minRankCode: "officer" },
  { modelCode: "chino2", displayName: "Chino Lowrider", brand: "Vapid", price: 0, tier: "crime", regions: ["EU"], access: ["gang"], minRankCode: "member" },

  { modelCode: "taxi", displayName: "Taxi Cab", brand: "Vapid", price: 0, tier: "service", regions: ["EU", "RU", "CIS", "DE"], access: ["job:taxi"] },
  { modelCode: "asea", displayName: "Taxi Economy", brand: "Declasse", price: 0, tier: "service", regions: ["RU", "CIS"], access: ["job:taxi"] },
  { modelCode: "tailgater2", displayName: "Taxi Comfort", brand: "Obey", price: 0, tier: "service", regions: ["DE", "EU"], access: ["job:taxi"] },
  { modelCode: "emperor", displayName: "Mechanic Service Sedan", brand: "Albany", price: 0, tier: "service", regions: ["EU"], access: ["job:mechanic"] },
  { modelCode: "utillitruck3", displayName: "Mechanic Utility", brand: "HVY", price: 0, tier: "service", regions: ["EU"], access: ["job:mechanic"] },
  { modelCode: "towtruck", displayName: "Tow Truck", brand: "Vapid", price: 0, tier: "service", regions: ["EU"], access: ["job:tow"] },
  { modelCode: "towtruck2", displayName: "Heavy Tow Truck", brand: "Vapid", price: 0, tier: "service", regions: ["EU"], access: ["job:tow"] },
  { modelCode: "rumpo3", displayName: "Medic Rapid Van", brand: "Bravado", price: 0, tier: "service", regions: ["EU", "DE"], access: ["job:medic"] },
  { modelCode: "speedo", displayName: "Medical Support Van", brand: "Vapid", price: 0, tier: "service", regions: ["EU"], access: ["job:medic"] }
];

const buyVehicleSchema = z.object({
  modelCode: z.string().min(2).max(48)
});

const setSpawnStateSchema = z.object({
  vehicleId: z.number().int().positive(),
  spawned: z.boolean()
});

const vehiclePrices: Record<string, number> = {
  sultan: 145000,
  buffalo: 210000,
  futo: 98000,
  blista: 65000
};

function generatePlate(): string {
  return `RP${randomBytes(3).toString("hex").toUpperCase()}`;
}

const giveKeySchema = z.object({
  vehicleId: z.number().int().positive(),
  targetCharacterId: z.number().int().positive()
});

const impoundSchema = z.object({
  vehicleId: z.number().int().positive(),
  impounded: z.boolean()
});

const upgradeSchema = z.object({
  vehicleId: z.number().int().positive(),
  insuranceLevel: z.number().int().min(0).max(3).optional(),
  tuningStage: z.number().int().min(0).max(5).optional()
});

const rankWeight: Record<string, number> = {
  recruit: 1,
  member: 10,
  officer: 30,
  sergeant: 50,
  captain: 70,
  chief: 100,
  leader: 100
};

function canUseByRank(currentRank: string, requiredRank?: string): boolean {
  if (!requiredRank) return true;
  return (rankWeight[currentRank] ?? 0) >= (rankWeight[requiredRank] ?? 0);
}

type VehicleSalon = {
  code: string;
  title: string;
  tiers: Array<CatalogVehicle["tier"]>;
  regions?: VehicleRegion[];
};

const salons: VehicleSalon[] = [
  { code: "budget", title: "Budget Market", tiers: ["economy"] },
  { code: "city", title: "City Comfort", tiers: ["comfort"] },
  { code: "sport", title: "Sport Line", tiers: ["sport"] },
  { code: "premium", title: "Premium Hall", tiers: ["premium"] },
  { code: "hyper", title: "Hyper Gallery", tiers: ["super"] },
  { code: "rucis", title: "RU/CIS Auto Mall", tiers: ["economy", "comfort", "sport", "premium"], regions: ["RU", "CIS"] },
  { code: "deeu", title: "DE/EU Auto Center", tiers: ["economy", "comfort", "sport", "premium", "super"], regions: ["DE", "EU"] }
];

async function getMergedCatalog(): Promise<CatalogVehicle[]> {
  const custom = await pool.query<{ data: CatalogVehicle }>(
    `SELECT data FROM vehicle_catalog_custom WHERE enabled = TRUE ORDER BY model_code ASC`
  );
  const map = new Map<string, CatalogVehicle>();
  for (const vehicle of catalogVehicles) map.set(vehicle.modelCode, vehicle);
  for (const row of custom.rows) map.set(row.data.modelCode, row.data);
  return Array.from(map.values());
}

export const vehiclesRouter = Router();

vehiclesRouter.get("/catalog", async (req, res) => {
  const regionFilter = typeof req.query.region === "string" ? req.query.region.toUpperCase() : null;
  const accessFilter = typeof req.query.access === "string" ? req.query.access : null;

  const userId = getUserIdFromRequest(req);
  let characterId: number | null = null;
  let factionType: "government" | "crime" | "business" | "gang" | null = null;
  let factionRankCode = "recruit";
  let activeJob: AccessGroup | null = null;
  if (userId) {
    characterId = await getCharacterIdByUserId(userId);
    if (characterId) {
      const membership = await getFactionMembershipByCharacterId(characterId);
      factionType = membership?.factionType ?? null;
      factionRankCode = membership?.rankCode ?? "recruit";
      const job = await pool.query<{ job_code: string }>(
        `SELECT job_code FROM character_jobs WHERE character_id = $1 AND active = TRUE LIMIT 1`,
        [characterId]
      );
      if ((job.rowCount ?? 0) > 0) {
        const code = `job:${job.rows[0].job_code}` as AccessGroup;
        if (["job:taxi", "job:medic", "job:mechanic", "job:tow"].includes(code)) activeJob = code;
      }
    }
  }

  const allowedAccess: AccessGroup[] = ["civilian"];
  if (factionType === "government") allowedAccess.push("government");
  if (factionType === "crime") allowedAccess.push("crime");
  if (factionType === "gang") allowedAccess.push("gang", "crime");
  if (activeJob) allowedAccess.push(activeJob);

  const mergedCatalog = await getMergedCatalog();
  const salonFilter = typeof req.query.salon === "string" ? req.query.salon.toLowerCase() : null;
  const salon = salonFilter ? salons.find((entry) => entry.code === salonFilter) : null;

  const result = mergedCatalog.filter((vehicle) => {
    if (salon) {
      if (!salon.tiers.includes(vehicle.tier)) return false;
      if (salon.regions && !vehicle.regions.some((region) => salon.regions?.includes(region))) return false;
    }
    if (regionFilter && !vehicle.regions.includes(regionFilter as VehicleRegion)) return false;
    if (accessFilter && !vehicle.access.includes(accessFilter as AccessGroup)) return false;
    if (!vehicle.access.some((entry) => allowedAccess.includes(entry))) return false;
    if ((vehicle.access.includes("government") || vehicle.access.includes("crime") || vehicle.access.includes("gang")) && !canUseByRank(factionRankCode, vehicle.minRankCode)) {
      return false;
    }
    return true;
  });

  return res.json({
    vehicles: result
  });
});

vehiclesRouter.get("/salons", async (req, res) => {
  const mergedCatalog = await getMergedCatalog();
  const regionFilter = typeof req.query.region === "string" ? req.query.region.toUpperCase() : null;
  return res.json({
    salons: salons.map((salon) => {
      const count = mergedCatalog.filter((vehicle) => {
        if (!salon.tiers.includes(vehicle.tier)) return false;
        if (salon.regions && !vehicle.regions.some((region) => salon.regions?.includes(region))) return false;
        if (regionFilter && !vehicle.regions.includes(regionFilter as VehicleRegion)) return false;
        return true;
      }).length;
      return {
        code: salon.code,
        title: salon.title,
        count
      };
    })
  });
});

vehiclesRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const vehicles = await pool.query<{
    id: number;
    model_code: string;
    plate: string;
    fuel: number;
    is_spawned: boolean;
    impounded: boolean;
    insurance_level: number;
    tuning_stage: number;
  }>(
    `SELECT id, model_code, plate, fuel, is_spawned, impounded, insurance_level, tuning_stage
       FROM vehicles
      WHERE character_id = $1
      ORDER BY id DESC`,
    [characterId]
  );

  return res.json({
    vehicles: vehicles.rows.map((vehicle) => ({
      id: vehicle.id,
      modelCode: vehicle.model_code,
      plate: vehicle.plate,
      fuel: vehicle.fuel,
      isSpawned: vehicle.is_spawned,
      impounded: vehicle.impounded,
      insuranceLevel: vehicle.insurance_level,
      tuningStage: vehicle.tuning_stage
    }))
  });
});

vehiclesRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const mergedCatalog = await getMergedCatalog();
  const vehicleMeta = mergedCatalog.find((entry) => entry.modelCode === parsed.data.modelCode);
  if (!vehicleMeta) return res.status(404).json({ message: "Vehicle model not found" });
  if (!vehicleMeta.access.includes("civilian")) {
    return res.status(403).json({ message: "This vehicle is not sold on civilian market" });
  }
  const price = vehicleMeta.price;
  const balance = await pool.query<{ money_bank: number }>(`SELECT money_bank FROM characters WHERE id = $1`, [
    characterId
  ]);
  if (balance.rowCount === 0) return res.status(404).json({ message: "Character not found" });
  if (balance.rows[0].money_bank < price) {
    return res.status(400).json({ message: "Not enough bank money" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`, [price, characterId]);
    const vehicle = await client.query<{ id: number; plate: string }>(
      `INSERT INTO vehicles (character_id, model_code, plate)
       VALUES ($1, $2, $3)
       RETURNING id, plate`,
      [characterId, parsed.data.modelCode, generatePlate()]
    );
    await client.query(
      `INSERT INTO economy_logs (character_id, action, amount) VALUES ($1, $2, $3)`,
      [characterId, `vehicle_buy_${parsed.data.modelCode}`, -price]
    );
    await client.query("COMMIT");
    return res.status(201).json({
      id: vehicle.rows[0].id,
      modelCode: parsed.data.modelCode,
      plate: vehicle.rows[0].plate,
      price,
      displayName: vehicleMeta.displayName
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to buy vehicle" });
  } finally {
    client.release();
  }
});

// Persist current position/heading of a vehicle. Called by RAGE MP server bridge
// on despawn/disconnect so vehicles re-appear where they were last left.
const positionSchema = z.object({
  vehicleId: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().default(0),
  fuel: z.number().min(0).max(100).optional(),
  locked: z.boolean().optional()
});
vehiclesRouter.post("/position", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const ok = await pool.query(
    `UPDATE vehicles
        SET pos_x = $1, pos_y = $2, pos_z = $3, heading = $4,
            fuel = COALESCE($5, fuel),
            locked = COALESCE($6, locked)
      WHERE id = $7 AND character_id = $8`,
    [
      parsed.data.x,
      parsed.data.y,
      parsed.data.z,
      parsed.data.heading,
      parsed.data.fuel ?? null,
      parsed.data.locked ?? null,
      parsed.data.vehicleId,
      characterId
    ]
  );
  if (ok.rowCount === 0) return res.status(404).json({ message: "Vehicle not found" });
  return res.json({ ok: true });
});

vehiclesRouter.post("/spawn", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = setSpawnStateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const result = await pool.query(
    `UPDATE vehicles
        SET is_spawned = $1
      WHERE id = $2 AND character_id = $3 AND impounded = FALSE`,
    [parsed.data.spawned, parsed.data.vehicleId, characterId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: "Vehicle not found" });

  return res.json({ ok: true });
});

vehiclesRouter.post("/keys/give", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const ownerCharacterId = await getCharacterIdByUserId(userId);
  if (!ownerCharacterId) return res.status(404).json({ message: "Character not found" });
  const parsed = giveKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const vehicle = await pool.query<{ id: number }>(
    `SELECT id FROM vehicles WHERE id = $1 AND character_id = $2`,
    [parsed.data.vehicleId, ownerCharacterId]
  );
  if (vehicle.rowCount === 0) return res.status(403).json({ message: "Only vehicle owner can give keys" });

  await pool.query(
    `INSERT INTO vehicle_keys (vehicle_id, owner_character_id, granted_by_character_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (vehicle_id, owner_character_id) DO NOTHING`,
    [parsed.data.vehicleId, parsed.data.targetCharacterId, ownerCharacterId]
  );
  return res.status(201).json({ ok: true });
});

vehiclesRouter.get("/keys/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const keys = await pool.query<{ vehicle_id: number; plate: string; model_code: string }>(
    `SELECT vk.vehicle_id, v.plate, v.model_code
       FROM vehicle_keys vk
       JOIN vehicles v ON v.id = vk.vehicle_id
      WHERE vk.owner_character_id = $1`,
    [characterId]
  );
  return res.json({
    keys: keys.rows.map((row) => ({ vehicleId: row.vehicle_id, plate: row.plate, modelCode: row.model_code }))
  });
});

vehiclesRouter.post("/impound", async (req, res) => {
  const adminToken = req.headers["x-admin-token"];
  if (adminToken !== config.adminToken) return res.status(403).json({ message: "Forbidden" });
  const parsed = impoundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`UPDATE vehicles SET impounded = $1, is_spawned = FALSE WHERE id = $2`, [
    parsed.data.impounded,
    parsed.data.vehicleId
  ]);
  return res.json({ ok: true });
});

vehiclesRouter.post("/upgrade", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const parsed = upgradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const vehicle = await pool.query<{ character_id: number; insurance_level: number; tuning_stage: number }>(
    `SELECT character_id, insurance_level, tuning_stage FROM vehicles WHERE id = $1`,
    [parsed.data.vehicleId]
  );
  if (vehicle.rowCount === 0) return res.status(404).json({ message: "Vehicle not found" });
  if (vehicle.rows[0].character_id !== characterId) return res.status(403).json({ message: "Not your vehicle" });

  const nextInsuranceLevel = parsed.data.insuranceLevel ?? vehicle.rows[0].insurance_level;
  const nextTuningStage = parsed.data.tuningStage ?? vehicle.rows[0].tuning_stage;
  const insurancePrice = Math.max(0, nextInsuranceLevel - vehicle.rows[0].insurance_level) * 40000;
  const tuningPrice = Math.max(0, nextTuningStage - vehicle.rows[0].tuning_stage) * 25000;
  const totalPrice = insurancePrice + tuningPrice;

  const balance = await pool.query<{ money_bank: number }>(`SELECT money_bank FROM characters WHERE id = $1`, [
    characterId
  ]);
  if (balance.rowCount === 0) return res.status(404).json({ message: "Character not found" });
  if (balance.rows[0].money_bank < totalPrice) return res.status(400).json({ message: "Not enough bank money" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`, [totalPrice, characterId]);
    await client.query(`UPDATE vehicles SET insurance_level = $1, tuning_stage = $2 WHERE id = $3`, [
      nextInsuranceLevel,
      nextTuningStage,
      parsed.data.vehicleId
    ]);
    await client.query(
      `INSERT INTO economy_logs (character_id, action, amount) VALUES ($1, $2, $3)`,
      [characterId, "vehicle_upgrade", -totalPrice]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Vehicle upgrade failed" });
  } finally {
    client.release();
  }

  return res.status(201).json({ ok: true, insuranceLevel: nextInsuranceLevel, tuningStage: nextTuningStage });
});

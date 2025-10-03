"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Generic
const BaseClasses_1 = require("C:/snapshot/project/obj/models/enums/BaseClasses");
const LogTextColor_1 = require("C:/snapshot/project/obj/models/spt/logging/LogTextColor");
const config_json_1 = __importDefault(require("../config/config.json"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config = config_json_1.default;
const SPT_TRADERS_FOLDER = config.sptDbPath || undefined;
const _traderNicknameCache = {};
class Mod {
    mod;
    constructor() {
        this.mod = "Pharmacist-1.0.0";
    }
    getTraderNickname(traderId, tradersObj) {
        if (_traderNicknameCache[traderId])
            return _traderNicknameCache[traderId];
        try {
            const trader = tradersObj && tradersObj[traderId];
            if (trader) {
                const candidate = (trader.base && trader.base.nickname) ||
                    trader.nickname ||
                    (trader.base && trader.base.name) ||
                    trader.name ||
                    trader.surname;
                if (candidate && typeof candidate === "string" && candidate.trim().length > 0) {
                    _traderNicknameCache[traderId] = candidate;
                    return candidate;
                }
            }
        }
        catch (e) {
        }
        // optional disk fallback if configured
        if (SPT_TRADERS_FOLDER) {
            try {
                const baseJsonPath = path.join(SPT_TRADERS_FOLDER, traderId, "base.json");
                if (fs.existsSync(baseJsonPath)) {
                    const raw = fs.readFileSync(baseJsonPath, { encoding: "utf8" });
                    const baseObj = JSON.parse(raw);
                    const diskName = baseObj && (baseObj.nickname || baseObj.name || baseObj.surname);
                    if (diskName && typeof diskName === "string") {
                        _traderNicknameCache[traderId] = diskName;
                        return diskName;
                    }
                }
            }
            catch (e) {
                if (typeof console.debug === "function")
                    console.debug(`getTraderNickname read error ${e.message}`);
            }
        }
        // fallback to id
        _traderNicknameCache[traderId] = traderId;
        return traderId;
    }
    //Each entry: { traderId, offerId, tpl (offer tpl), req (object reference), path: string for logging }
    buildTplIndex(traders) {
        const index = new Map();
        for (const traderId of Object.keys(traders || {})) {
            const trader = traders[traderId];
            if (!trader || !trader.assort)
                continue;
            const offerIdToTpl = Object.create(null);
            const itemsArr = trader.assort.items || [];
            for (const oi of itemsArr) {
                if (oi && oi._id && oi._tpl)
                    offerIdToTpl[oi._id] = oi._tpl;
            }
            const barter = trader.assort.barter_scheme || {};
            for (const offerId of Object.keys(barter)) {
                const offerTpl = offerIdToTpl[offerId];
                if (!offerTpl)
                    continue;
                const barterVal = barter[offerId];
                if (Array.isArray(barterVal)) {
                    for (let i = 0; i < barterVal.length; i++) {
                        const inner = barterVal[i];
                        if (Array.isArray(inner)) {
                            for (let j = 0; j < inner.length; j++) {
                                const req = inner[j];
                                if (req && (typeof req.count === 'number' || req.count != null)) {
                                    const arr = index.get(offerTpl) || [];
                                    arr.push({
                                        traderId,
                                        offerId,
                                        tpl: offerTpl,
                                        traderNickname: this.getTraderNickname(traderId, traders),
                                        req,
                                        path: `[${offerId}][${i}][${j}]`
                                    });
                                    index.set(offerTpl, arr);
                                }
                            }
                        }
                        else if (inner && typeof inner === 'object') {
                            const req = inner;
                            if (req && (typeof req.count === 'number' || req.count != null)) {
                                const arr = index.get(offerTpl) || [];
                                arr.push({
                                    traderId,
                                    offerId,
                                    tpl: offerTpl,
                                    traderNickname: this.getTraderNickname(traderId, traders),
                                    req,
                                    path: `[${offerId}][${i}]`
                                });
                                index.set(offerTpl, arr);
                            }
                        }
                    }
                }
                else if (barterVal && typeof barterVal === 'object') {
                    for (const key of Object.keys(barterVal)) {
                        const req = barterVal[key];
                        if (req && (typeof req.count === 'number' || req.count != null)) {
                            const arr = index.get(offerTpl) || [];
                            arr.push({
                                traderId,
                                offerId,
                                traderNickname: this.getTraderNickname(traderId, traders),
                                tpl: offerTpl,
                                req,
                                path: `[${offerId}].${key}`
                            });
                            index.set(offerTpl, arr);
                        }
                    }
                }
            }
        }
        return index;
    }
    postDBLoad(container) {
        var stimMaxUses = 0;
        var medHp = 0;
        var medUsages = 0;
        var drugUsages = 0;
        var oldPrice = 0;
        var newPrice = 0;
        var oldMaxHpResource = 0;
        var stimMulti = Math.round(config.stimUsesMultiplier);
        var drugMulti = Math.round(config.drugUsesMultiplier);
        var medicalMulti = Math.round(config.medicalUsesMultiplier);
        var medkitMulti = Math.round(config.medkitHpMultiplier);
        var morphineId = "544fb3f34bdc2d03748b456a";
        const logger = container.resolve("WinstonLogger");
        const db = container.resolve("DatabaseServer");
        const tables = db.getTables();
        const items = tables.templates.items;
        const locales = tables.locales.global;
        const handbook = tables.templates.handbook.Items;
        const traders = tables.traders;
        const changedTpls = new Set();
        let loopedOverStims = 0;
        let loopedOverMedkits = 0;
        let loopedOverMedical = 0;
        let loopedOverDrugs = 0;
        logger.logWithColor("[Pharmacist] IMPROVING YOUR PHARMACEUTICAL NEEDS...", LogTextColor_1.LogTextColor.CYAN);
        // --- mutate items
        for (const itemKey in items) {
            const item = items[itemKey];
            if (!item)
                continue;
            const itemProps = item._props;
            const itemId = item._id;
            // STIMS
            if (config.changeStims && item._parent == BaseClasses_1.BaseClasses.STIMULATOR) {
                if (config.blacklisted_stims.includes(itemId) && config.logItemsWithModifiedUses) {
                    logger.logWithColor(`[Pharmacist - Stims] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not get infinite uses`, LogTextColor_1.LogTextColor.GRAY);
                    continue;
                }
                if (config.infStims) {
                    itemProps.MaxHpResource = 999;
                }
                else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0)
                        itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * stimMulti;
                    stimMaxUses = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                }
                if (config.changePrice) {
                    const hb = handbook.find((i) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * stimMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            logger.logWithColor(`[Pharmacist - Stims] Changing price of item ${locales["en"][itemId + " ShortName"]} from ${oldPrice} to ${newPrice}`, LogTextColor_1.LogTextColor.GRAY);
                        }
                    }
                    else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
                if (config.logItemsWithModifiedUses)
                    logger.logWithColor(`[Pharmacist - Stims] ${locales["en"][itemId + " ShortName"]} from ${oldMaxHpResource} uses to ${stimMaxUses} uses`, LogTextColor_1.LogTextColor.GRAY);
                loopedOverStims++;
            }
            // MEDKITS
            if (config.changeMedkits && item._parent == BaseClasses_1.BaseClasses.MEDKIT) {
                if (config.blacklisted_medkits.includes(itemId) && config.logItemsWithModifiedUses) {
                    logger.logWithColor(`[Pharmacist - Medkits] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not get infinite hp`, LogTextColor_1.LogTextColor.RED);
                    continue;
                }
                if (config.infMedkits) {
                    itemProps.MaxHpResource = 9999;
                }
                else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0)
                        itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * medkitMulti;
                    medHp = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                }
                if (config.changePrice) {
                    const hb = handbook.find((i) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * medkitMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            logger.logWithColor(`[Pharmacist - Medkits] Changing price of item ${locales["en"][itemId + " ShortName"]} from ${oldPrice} to ${newPrice}`, LogTextColor_1.LogTextColor.GRAY);
                        }
                    }
                    else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
                if (config.logItemsWithModifiedUses)
                    logger.logWithColor(`[Pharmacist - Medkits] ${locales["en"][itemId + " ShortName"]} from ${oldMaxHpResource} hp to ${medHp} hp`, LogTextColor_1.LogTextColor.GRAY);
                loopedOverMedkits++;
            }
            // MEDICAL
            if (config.changeMedical && item._parent == BaseClasses_1.BaseClasses.MEDICAL) {
                if (config.blacklisted_medical.includes(itemId) && config.logItemsWithModifiedUses) {
                    logger.logWithColor(`[Pharmacist - Medical] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not get infinite hp`, LogTextColor_1.LogTextColor.RED);
                    continue;
                }
                if (config.infMedical) {
                    itemProps.MaxHpResource = 999;
                }
                else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0)
                        itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * medicalMulti;
                    medUsages = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                }
                if (config.changePrice) {
                    const hb = handbook.find((i) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * medicalMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            logger.logWithColor(`[Pharmacist - Medical] Changing price of item ${locales["en"][itemId + " ShortName"]} from ${oldPrice} to ${newPrice}`, LogTextColor_1.LogTextColor.GRAY);
                        }
                    }
                    else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
                if (config.logItemsWithModifiedUses)
                    logger.logWithColor(`[Pharmacist - Medical] ${locales["en"][itemId + " ShortName"]} from ${oldMaxHpResource} uses to ${medUsages} uses`, LogTextColor_1.LogTextColor.GRAY);
                loopedOverMedical++;
            }
            // DRUGS
            if (config.changeDrugs && item._parent == BaseClasses_1.BaseClasses.DRUGS) {
                if (config.blacklisted_drugs.includes(itemId) && config.logItemsWithModifiedUses) {
                    logger.logWithColor(`[Pharmacist - Drugs] ${locales["en"][itemId + " ShortName"]} is blacklisted and will not get infinite uses`, LogTextColor_1.LogTextColor.RED);
                    continue;
                }
                if (config.infDrugs) {
                    itemProps.MaxHpResource = 999;
                }
                else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0)
                        itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * drugMulti;
                    drugUsages = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                }
                if (config.changePrice) {
                    const hb = handbook.find((i) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * drugMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            logger.logWithColor(`[Pharmacist - Drugs] Changing price of item ${locales["en"][itemId + " ShortName"]} from ${oldPrice} to ${newPrice}`, LogTextColor_1.LogTextColor.GRAY);
                        }
                    }
                    else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
                if (config.logItemsWithModifiedUses)
                    logger.logWithColor(`[Pharmacist - Drugs] ${locales["en"][itemId + " ShortName"]} from ${oldMaxHpResource} uses to ${drugUsages} uses`, LogTextColor_1.LogTextColor.GRAY);
                loopedOverDrugs++;
            }
            // Morphine special case
            if (item._id == morphineId && config.changeStims) {
                if (config.blacklisted_stims.includes(item._id) && config.logItemsWithModifiedUses) {
                    logger.logWithColor(`[Pharmacist - Morphine] ${locales["en"][`${item._id} ShortName`]} is blacklisted and will not get infinite uses`, LogTextColor_1.LogTextColor.RED);
                }
                else {
                    if (config.infStims)
                        itemProps.MaxHpResource = 999;
                    else {
                        oldMaxHpResource = itemProps.MaxHpResource;
                        if (itemProps.MaxHpResource == 0)
                            itemProps.MaxHpResource = 1;
                        itemProps.MaxHpResource = itemProps.MaxHpResource * stimMulti;
                        stimMaxUses = itemProps.MaxHpResource;
                        changedTpls.add(item._id);
                    }
                    if (config.changePrice) {
                        const hb = handbook.find((i) => i.Id === item._id);
                        if (hb) {
                            oldPrice = hb.Price;
                            newPrice = oldPrice * stimMulti;
                            hb.Price = newPrice;
                            if (config.logItemsWithModifiedUses) {
                                logger.logWithColor(`[Pharmacist - Stims] Changing price of item ${locales["en"][item._id + " ShortName"]} from ${oldPrice} to ${newPrice}`, LogTextColor_1.LogTextColor.GRAY);
                            }
                        }
                        else if (config.logItemsWithModifiedUses) {
                            logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][item._id + " ShortName"]} in handbook`);
                        }
                    }
                    if (config.logItemsWithModifiedUses)
                        logger.logWithColor(`[Pharmacist - Morphine] ${locales["en"][item._id + " ShortName"]} from ${oldMaxHpResource} uses to ${stimMaxUses} uses`, LogTextColor_1.LogTextColor.GRAY);
                    loopedOverStims++;
                }
            }
        } // end items loop
        // Build index of tpl -> req refs (one-time scan)
        const tplIndex = this.buildTplIndex(traders);
        // Only scale if we changed some tpl
        if (changedTpls.size > 0 && config.changePrice) {
            const t0 = Date.now();
            const tplMultiplier = new Map();
            for (const tpl of changedTpls) {
                let m = 1;
                const catalog = items[tpl];
                if (catalog && catalog._parent) {
                    const p = catalog._parent;
                    if (p === BaseClasses_1.BaseClasses.STIMULATOR)
                        m = stimMulti || 1;
                    else if (p === BaseClasses_1.BaseClasses.MEDKIT)
                        m = medkitMulti || 1;
                    else if (p === BaseClasses_1.BaseClasses.MEDICAL)
                        m = medicalMulti || 1;
                    else if (p === BaseClasses_1.BaseClasses.DRUGS)
                        m = drugMulti || 1;
                }
                tplMultiplier.set(tpl, m);
            }
            // build currency whitelist set once
            const currencySet = new Set((config.currencyTpls && Array.isArray(config.currencyTpls)) ? config.currencyTpls : []);
            // scale via index
            let totalUpdated = 0;
            let totalReqs = 0;
            for (const tpl of tplMultiplier.keys()) {
                const multiplier = tplMultiplier.get(tpl) || 1;
                if (!multiplier || multiplier === 1)
                    continue;
                const refs = tplIndex.get(tpl);
                if (!refs || refs.length === 0)
                    continue;
                for (const entry of refs) {
                    const req = entry.req;
                    if (!req)
                        continue;
                    if (currencySet.size > 0) {
                        if (!req._tpl || !currencySet.has(req._tpl))
                            continue;
                    }
                    if (typeof req.count === 'number' && isFinite(req.count)) {
                        totalReqs++;
                        const old = req.count;
                        let newCount;
                        if (Math.floor(old) === old) {
                            newCount = Math.max(1, Math.round(old * multiplier));
                        }
                        else {
                            newCount = parseFloat((old * multiplier).toFixed(2));
                            if (newCount < 0.01)
                                newCount = 0.01;
                        }
                        if (newCount !== old) {
                            req.count = newCount;
                            totalUpdated++;
                            if (config.logItemsWithModifiedUses) {
                                const nick = entry.traderNickname || this.getTraderNickname(entry.traderId, traders);
                                const shortName = (locales && locales["en"] && locales["en"][entry.tpl + " ShortName"]) || entry.tpl;
                                logger.logWithColor(`[Pharmacist] Trader ${nick} updated ${shortName}'s price from ${old} to ${newCount}`, LogTextColor_1.LogTextColor.GRAY);
                            }
                        }
                    }
                }
            }
            const t1 = Date.now();
            if (config.logItemsWithModifiedUses)
                logger.logWithColor(`[Pharmacist] Scaled barter counts for ${totalUpdated} items.`, LogTextColor_1.LogTextColor.CYAN);
        }
        else {
            logger.logWithColor("[Pharmacist] Trader prices have not been updated.", LogTextColor_1.LogTextColor.GRAY);
        }
        logger.logWithColor(`[Pharmacist] FOUND AND MODDED ${loopedOverDrugs + loopedOverMedical + loopedOverMedkits + loopedOverStims} ITEMS.`, LogTextColor_1.LogTextColor.CYAN);
        logger.logWithColor(`[Pharmacist] ${loopedOverStims} stims now have x${stimMulti} uses.`, LogTextColor_1.LogTextColor.CYAN);
        logger.logWithColor(`[Pharmacist] ${loopedOverMedkits} medkits now have x${medkitMulti} hp.`, LogTextColor_1.LogTextColor.CYAN);
        logger.logWithColor(`[Pharmacist] ${loopedOverMedical} medical items now have x${medicalMulti} uses.`, LogTextColor_1.LogTextColor.CYAN);
        logger.logWithColor(`[Pharmacist] ${loopedOverDrugs} drug items now have x${drugMulti} uses.`, LogTextColor_1.LogTextColor.CYAN);
    }
}
module.exports = { mod: new Mod() };
//# sourceMappingURL=mod.js.map
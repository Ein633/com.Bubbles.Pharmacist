import { DependencyContainer } from "tsyringe";

import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";

// Generic
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";

import configJson from "../config/config.json";

interface Config {
    logItemsWithModifiedUses: boolean;
    changeCrafts?: boolean;
    currencyTpls?: string[];
    barterScaleMode?: 'both' | 'currency' | 'items';
    itemTpls?: string[];

    changeStims: boolean;
    blacklisted_stims: string[];
    infStims: boolean;
    stimUses: number;
    stimUsesMultiplier: number;

    changeMedical: boolean;
    blacklisted_medical: string[];
    infMedical: boolean;
    medicalUses: number;
    medicalUsesMultiplier: number;

    changeMedkits: boolean;
    blacklisted_medkits: string[];
    infMedkits: boolean;
    medkitHp: number;
    medkitHpMultiplier: number;    
    
    changeDrugs: boolean;
    blacklisted_drugs: string[];
    infDrugs: boolean;
    drugUses: number;
    drugUsesMultiplier: number;
}

const config = configJson as unknown as Config;
const _traderNicknameCache: Record<string, string> = {};

class Mod implements IPostDBLoadMod {   
    private mod: string;
    constructor() {
        this.mod = "Pharmacist-1.0.2"
    }

    private getTraderNickname(traderId: string, tradersObj: any): string | undefined {
        if (_traderNicknameCache[traderId]) return _traderNicknameCache[traderId];

        try {
            const trader = tradersObj && tradersObj[traderId];
            if (trader) {
                const candidate =
                    (trader.base && trader.base.nickname) ||
                    trader.nickname ||
                    (trader.base && trader.base.name) ||
                    trader.name ||
                    trader.surname;
                if (candidate && typeof candidate === "string" && candidate.trim().length > 0) {
                    _traderNicknameCache[traderId] = candidate;
                    return candidate;
                }
            }
        } catch (e) {
            // ignore
        }
        return undefined;
    }

    private buildTplIndex(traders: any) {
        const index = new Map<string, Map<string, Array<any>>>();

        for (const traderId of Object.keys(traders || {})) {
            const trader = traders[traderId];
            if (!trader || !trader.assort) continue;

            const offerIdToTpl: Record<string, string> = Object.create(null);
            const itemsArr = trader.assort.items || [];
            for (const oi of itemsArr) {
                if (oi && oi._id && oi._tpl) offerIdToTpl[oi._id] = oi._tpl;
            }

            const barter = trader.assort.barter_scheme || {};
            for (const offerId of Object.keys(barter)) {
                const offerTpl = offerIdToTpl[offerId];
                if (!offerTpl) continue;

                const barterVal = barter[offerId];
                const perOfferMap = index.get(offerTpl) || new Map<string, Array<any>>();
                const arrForOffer = perOfferMap.get(offerId) || [];

                if (Array.isArray(barterVal)) {
                    for (let i = 0; i < barterVal.length; i++) {
                        const inner = barterVal[i];
                        if (Array.isArray(inner)) {
                            for (let j = 0; j < inner.length; j++) {
                                const req = inner[j];
                                if (req && (typeof req.count === 'number' || req.count != null)) {
                                    // store parent reference and key so we can verify identity later in O(1)
                                    arrForOffer.push({
                                        traderId,
                                        offerId,
                                        tpl: offerTpl,
                                        traderNickname: this.getTraderNickname(traderId, traders),
                                        req,
                                        parentRef: inner,
                                        parentKey: j,
                                        path: `[${offerId}][${i}][${j}]`
                                    });
                                }
                            }
                        } else if (inner && typeof inner === 'object') {
                            const req = inner;
                            if (req && (typeof req.count === 'number' || req.count != null)) {
                                arrForOffer.push({
                                    traderId,
                                    offerId,
                                    tpl: offerTpl,
                                    traderNickname: this.getTraderNickname(traderId, traders),
                                    req,
                                    parentRef: barterVal,
                                    parentKey: i,
                                    path: `[${offerId}][${i}]`
                                });
                            }
                        }
                    }
                } else if (barterVal && typeof barterVal === 'object') {
                    for (const key of Object.keys(barterVal)) {
                        const req = barterVal[key];
                        if (req && (typeof req.count === 'number' || req.count != null)) {
                            arrForOffer.push({
                                traderId,
                                offerId,
                                traderNickname: this.getTraderNickname(traderId, traders),
                                tpl: offerTpl,
                                req,
                                parentRef: barterVal,
                                parentKey: key,
                                path: `[${offerId}].${key}`
                            });
                        }
                    }
                }

                if (arrForOffer.length > 0) {
                    perOfferMap.set(offerId, arrForOffer);
                    index.set(offerTpl, perOfferMap);
                }
            }
        }

        return index;
    }

    public postDBLoad(container: DependencyContainer): void {

        const barterMode = (config.barterScaleMode && typeof config.barterScaleMode === 'string') ? config.barterScaleMode : 'both';

        var stimMaxUses = 0;
        var medHp = 0;
        var medUsages = 0;
        var drugUsages = 0;
        var oldPrice = 0;
        var newPrice = 0;
        var oldMaxHpResource = 0;

        var stimMulti = Math.round(config.stimUsesMultiplier)
        var drugMulti = Math.round(config.drugUsesMultiplier)
        var medicalMulti = Math.round(config.medicalUsesMultiplier)
        var medkitMulti = Math.round(config.medkitHpMultiplier)

        var morphineId = "544fb3f34bdc2d03748b456a";

        // Helper types and functions to support per-item base-class selection with fallback
        type Kind = 'stim' | 'medkit' | 'medical' | 'drug';
        const classEnabled = (k: Kind) =>
            k === 'stim' ? config.changeStims
            : k === 'medkit' ? config.changeMedkits
            : k === 'medical' ? config.changeMedical
            : config.changeDrugs;

        const isBlacklistedFor = (tpl: string, k: Kind) =>
            k === 'stim' ? config.blacklisted_stims.includes(tpl)
            : k === 'medkit' ? config.blacklisted_medkits.includes(tpl)
            : k === 'medical' ? config.blacklisted_medical.includes(tpl)
            : config.blacklisted_drugs.includes(tpl);

        // Compute priority list of applicable kinds for an item.
        // Default is based on the direct parent, but allow multi-kind priority for known cases (e.g., morphine).
        const getPriorityKinds = (it: any): Kind[] => {
            if (!it) return [];
            if (it._id === morphineId) return ['stim', 'medical'];
            const p = it._parent;
            if (p === BaseClasses.STIMULATOR) return ['stim'];
            if (p === BaseClasses.MEDKIT) return ['medkit'];
            if (p === BaseClasses.MEDICAL) return ['medical'];
            if (p === BaseClasses.DRUGS) return ['drug'];
            return [];
        };

        // Track the selected class per tpl to keep trader/recipe scaling consistent with the chosen class
        const selectedClassByTpl = new Map<string, Kind>();

        const logger = container.resolve<ILogger>("WinstonLogger");
        const traderLogLines: string[] = [];
        const recipeLogLines: string[] = [];
        const handbookLogLines: string[] = [];
        const stimsLogLines: string[] = [];
        const medkitsLogLines: string[] = [];
        const medicalsLogLines: string[] = [];
        const drugsLogLines: string[] = [];
        const db = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = db.getTables();
        const items = tables.templates.items;
        const locales = tables.locales.global;
        const handbook = tables.templates.handbook.Items;
        const traders = tables.traders;
  
        const recipes = tables.hideout.production.recipes
        const changedTpls = new Set<string>();

    // Cache lookups to avoid repeated O(n) searches
        const handbookById = new Map<string, any>();
        if (Array.isArray(handbook)) {
            for (const h of handbook) if (h && h.Id) handbookById.set(h.Id, h);
        }

        const shortNameCache = new Map<string, string>();
        const getShortName = (tpl: string) => {
            if (!tpl) return tpl;
            const c = shortNameCache.get(tpl);
            if (c) return c;
            const sn = (locales && locales["en"] && locales["en"][tpl + " ShortName"]) || tpl;
            shortNameCache.set(tpl, sn);
            return sn;
        };

    // precompute currency/item sets once
    const cachedCurrencySet = new Set<string>((config.currencyTpls && Array.isArray(config.currencyTpls)) ? config.currencyTpls : []);
    const cachedItemSet = new Set<string>((config.itemTpls && Array.isArray(config.itemTpls)) ? config.itemTpls : []);

        let loopedOverStims = 0;
        let loopedOverMedkits = 0;
        let loopedOverMedical = 0;
        let loopedOverDrugs = 0;
        let totalRecipesUpdated = 0;
        let totalTradersUpdated = 0;

        logger.logWithColor("[Pharmacist] IMPROVING YOUR PHARMACEUTICAL NEEDS...", LogTextColor.CYAN);

        // --- mutate items
        for (const itemKey in items) {
            const item = items[itemKey];
            if (!item) continue;
            const itemProps = item._props;
            const itemId = item._id;

            // Determine which class to apply for this item (with blacklist-aware fallback)
            const priorityKinds = getPriorityKinds(item);
            let chosenKind: Kind | null = null;
            for (const k of priorityKinds) {
                if (classEnabled(k) && !isBlacklistedFor(itemId, k)) { chosenKind = k; break; }
            }

            // STIMS
            if (chosenKind === 'stim') {
                if (config.blacklisted_stims.includes(itemId)) {
                    if (config.logItemsWithModifiedUses) {
                        logger.logWithColor(`[Pharmacist - Stims] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not be modified`, LogTextColor.RED);
                    }
                    continue;
                }

                if (config.infStims) {
                    itemProps.MaxHpResource = 999;
                } else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0) itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * stimMulti;
                    stimMaxUses = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                    selectedClassByTpl.set(itemId, 'stim');
                    loopedOverStims++;

                    if (config.logItemsWithModifiedUses) stimsLogLines.push(`[Pharmacist - Stims] ${locales["en"][itemId + " ShortName"]} from ${oldMaxHpResource} uses to ${stimMaxUses} uses`);
                }

                if (config.barterScaleMode) {
                    const hb = handbookById.get(itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * stimMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            handbookLogLines.push(`[Pharmacist - Handbook] Changing the price of ${getShortName(itemId)} from ${oldPrice} to ${newPrice}`);
                        }
                    } else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${getShortName(itemId)} in handbook`);
                    }
                }
            }

            // MEDKITS
            if (chosenKind === 'medkit') {
                if (config.blacklisted_medkits.includes(itemId)) {
                    if (config.logItemsWithModifiedUses) {
                        logger.logWithColor(`[Pharmacist - Medkits] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not be modified`, LogTextColor.RED);
                    }
                    continue;
                }

                if (config.infMedkits) {
                    itemProps.MaxHpResource = 9999;
                } else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0) itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * medkitMulti;
                    medHp = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                    selectedClassByTpl.set(itemId, 'medkit');
                    loopedOverMedkits++;

                        if (config.logItemsWithModifiedUses) medkitsLogLines.push(`[Pharmacist - Medkits] ${getShortName(itemId)} from ${oldMaxHpResource} hp to ${medHp} hp`);
                }

                if (barterMode === 'both' || barterMode === 'currency') {
                    const hb = handbook.find((i: any) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * medkitMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            handbookLogLines.push(`[Pharmacist - Handbook] Changing the price of ${getShortName(itemId)} from ${oldPrice} to ${newPrice}`);
                        }
                    } else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
            }

            // MEDICAL
            if (chosenKind === 'medical') {
                if (config.blacklisted_medical.includes(itemId)) {
                    if (config.logItemsWithModifiedUses) {
                        logger.logWithColor(`[Pharmacist - Medical] ${locales["en"][`${itemId} ShortName`]} is blacklisted and will not be modified`, LogTextColor.RED);
                    }
                    continue;
                }

                if (config.infMedical) {
                    itemProps.MaxHpResource = 999;
                } else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0) itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * medicalMulti;
                    medUsages = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                    selectedClassByTpl.set(itemId, 'medical');
                    loopedOverMedical++;

                    if (config.logItemsWithModifiedUses) medicalsLogLines.push(`[Pharmacist - Medical] ${getShortName(itemId)} from ${oldMaxHpResource} uses to ${medUsages} uses`);
                }

                if (barterMode === 'both' || barterMode === 'currency') {
                    const hb = handbook.find((i: any) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * medicalMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            handbookLogLines.push(`[Pharmacist - Handbook] Changing the price of ${getShortName(itemId)} from ${oldPrice} to ${newPrice}`);
                        }
                    } else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
            }

            // DRUGS
            if (chosenKind === 'drug') {
                if (config.blacklisted_drugs.includes(itemId)) {
                    if (config.logItemsWithModifiedUses) {
                        logger.logWithColor(`[Pharmacist - Drugs] ${locales["en"][itemId + " ShortName"]} is blacklisted and will not be modified`, LogTextColor.RED);
                    }
                    continue;
                }

                if (config.infDrugs) {
                    itemProps.MaxHpResource = 999;
                } else {
                    oldMaxHpResource = itemProps.MaxHpResource;
                    if (itemProps.MaxHpResource == 0) itemProps.MaxHpResource = 1;
                    itemProps.MaxHpResource = itemProps.MaxHpResource * drugMulti;
                    drugUsages = itemProps.MaxHpResource;
                    changedTpls.add(itemId);
                    selectedClassByTpl.set(itemId, 'drug');
                    loopedOverDrugs++;

                    if (config.logItemsWithModifiedUses) drugsLogLines.push(`[Pharmacist - Drugs] ${getShortName(itemId)} from ${oldMaxHpResource} uses to ${drugUsages} uses`);
                }

                if (barterMode === 'both' || barterMode === 'currency') {
                    const hb = handbook.find((i: any) => i.Id === itemId);
                    if (hb) {
                        oldPrice = hb.Price;
                        newPrice = oldPrice * drugMulti;
                        hb.Price = newPrice;
                        if (config.logItemsWithModifiedUses) {
                            handbookLogLines.push(`[Pharmacist - Handbook] Changing the price of ${locales["en"][itemId + " ShortName"]} from ${oldPrice} to ${newPrice}`);
                        }
                    } else if (config.logItemsWithModifiedUses) {
                        logger.error(`[Pharmacist - Error] Could not find item ${locales["en"][itemId + " ShortName"]} in handbook`);
                    }
                }
                
            }
        } 

        // Build index of tpl -> req refs (one-time scan)
        const tplIndex = this.buildTplIndex(traders);

        //Multiplier
        if (changedTpls.size > 0 && (barterMode === 'both' || barterMode === 'currency' || barterMode === 'items')) {
            const tplMultiplier = new Map<string, number>();
            for (const tpl of changedTpls) {
                let m = 1;
                const kind = selectedClassByTpl.get(tpl);
                if (kind === 'stim') m = stimMulti || 1;
                else if (kind === 'medkit') m = medkitMulti || 1;
                else if (kind === 'medical') m = medicalMulti || 1;
                else if (kind === 'drug') m = drugMulti || 1;
                else {
                    // Fallback to legacy parent-based resolution if mapping is missing
                    const p = items[tpl]?._parent;
                    if (p === BaseClasses.STIMULATOR) m = stimMulti || 1;
                    else if (p === BaseClasses.MEDKIT) m = medkitMulti || 1;
                    else if (p === BaseClasses.MEDICAL) m = medicalMulti || 1;
                    else if (p === BaseClasses.DRUGS) m = drugMulti || 1;
                }
                tplMultiplier.set(tpl, m);
            }

            let totalReqs = 0;
            for (const tpl of tplMultiplier.keys()) {
                const multiplier = tplMultiplier.get(tpl) || 1;
                if (!multiplier || multiplier === 1) continue;

                const perOfferMap = tplIndex.get(tpl) as Map<string, Array<any>> | undefined;
                if (!perOfferMap) continue;

                const shortName = (locales && locales["en"] && locales["en"][tpl + " ShortName"]) || tpl;

                // compute sets once per run rather than per-tpl in hot loops
                const currencySet = cachedCurrencySet;
                const itemSet = cachedItemSet;

                // scale via index
                for (const [offerId, refs] of perOfferMap.entries()) {
                    if (!refs || refs.length === 0) continue;
                    for (const entry of refs) {
                        const req = entry.req;
                        if (!req) continue;

                        // fast identity check using stored parentRef/parentKey
                        const parentRef = entry.parentRef;
                        const parentKey = entry.parentKey;
                        if (!parentRef) continue;
                        // parentRef[parentKey] should === req
                        if (parentRef[parentKey] !== req) continue;

                        // decide whether to scale based on barterScaleMode
                        const reqTpl = req._tpl;
                        const isCurrencyReq = !!reqTpl && currencySet.has(reqTpl);
                        const isItemReq = !!reqTpl && (itemSet.size > 0 ? itemSet.has(reqTpl) : !isCurrencyReq);

                            let shouldScale = false;
                            if (barterMode === 'both') {
                                if (currencySet.size === 0 && itemSet.size === 0) shouldScale = true;
                                else shouldScale = isCurrencyReq || isItemReq;
                            } else if (barterMode === 'currency') {
                                if (currencySet.size === 0) shouldScale = true;
                                else shouldScale = isCurrencyReq;
                            } else if (barterMode === 'items') {
                                if (itemSet.size === 0) shouldScale = !isCurrencyReq;
                                else shouldScale = isItemReq;
                            }

                            if (!shouldScale) continue;

                        if (typeof req.count === 'number' && isFinite(req.count)) {
                            totalReqs++;
                            const old = req.count;
                            let newCount: number;
                            if (Math.floor(old) === old) {
                                newCount = Math.max(1, Math.round(old * multiplier));
                            }
                            else {
                                newCount = parseFloat((old * multiplier).toFixed(2));
                                if (newCount < 0.01) newCount = 0.01;
                            }

                            if (newCount !== old) {
                                req.count = newCount;
                                totalTradersUpdated++;

                                    if (config.logItemsWithModifiedUses) {
                                        const nick = entry.traderNickname || this.getTraderNickname(entry.traderId, traders);
                                        const entryShort = (entry.tpl === tpl) ? shortName : getShortName(entry.tpl);
                                        traderLogLines.push(`[Pharmacist - Traders] ${nick} updated ${entryShort}'s price from ${old} to ${newCount}`);
                                    }
                            }
                        }
                    }
                }

                //Update hideout recipes
                if (config.changeCrafts) {
                    try {
                        const matched = Array.isArray(recipes) ? recipes.filter((r: any) => r && r.endProduct === tpl) : [];
                        for (const recipe of matched) {
                            //logger.logWithColor(`[Pharmacist - DEBUG] found recipe._id=${recipe._id} for endProduct=${tpl}`, LogTextColor.RED);
                            if (!Array.isArray(recipe.requirements)) continue;
                            for (const req of recipe.requirements) {
                                const old = req.count;
                                if (!req || typeof req.count !== 'number' || !isFinite(req.count)) continue;
                                if (req.type && req.type !== 'Item') continue;

                                
                                let newCount: number;
                                if (Math.floor(old) === old) {
                                    newCount = Math.max(1, Math.round(old * multiplier));
                                } 
                                else {
                                    newCount = parseFloat((old * multiplier).toFixed(2));
                                    if (newCount < 0.01) newCount = 0.01;
                                }

                                if (newCount !== old) {
                                    req.count = newCount;
                                    totalRecipesUpdated++;
                                }
                                
                            }

                        }

                        if (config.logItemsWithModifiedUses) {
                            recipeLogLines.push(`[Pharmacist - Recipes] Hideout recipe for ${shortName} updated to require x${multiplier} items.`);
                        }
                    }

                    catch (e: any) {
                        logger.logWithColor(`[Pharmacist - Error] Error updating hideout recipe for ${tpl}: ${e && e.message ? e.message : e}`, LogTextColor.RED);
                    }
                }
            }
        } 
        
        else {
            logger.logWithColor("[Pharmacist] Trader prices have not been updated.", LogTextColor.RED);
        }

        //Logs
        if (config.logItemsWithModifiedUses) {

            // Stims
            if (stimsLogLines && stimsLogLines.length > 0) {
                for (const line of stimsLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Medkits
            if (medkitsLogLines && medkitsLogLines.length > 0) {
                for (const line of medkitsLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Medicals
            if (medicalsLogLines && medicalsLogLines.length > 0) {
                for (const line of medicalsLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Drugs
            if (drugsLogLines && drugsLogLines.length > 0) {
                for (const line of drugsLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Handbook
            if (handbookLogLines && handbookLogLines.length > 0) {
                for (const line of handbookLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Traders
            if (traderLogLines && traderLogLines.length > 0) {
                for (const line of traderLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Recipes
            if (recipeLogLines && recipeLogLines.length > 0) {
                for (const line of recipeLogLines) {
                    logger.logWithColor(line, LogTextColor.GRAY);
                }
            }

            // Summary totals
            logger.logWithColor(`[Pharmacist] Updated ${loopedOverStims} stims now have x${stimMulti} uses.`, LogTextColor.CYAN);
            logger.logWithColor(`[Pharmacist] Updated ${loopedOverMedkits} medkits now have x${medkitMulti} hp.`, LogTextColor.CYAN);
            logger.logWithColor(`[Pharmacist] Updated ${loopedOverMedical} medical items now have x${medicalMulti} uses.`, LogTextColor.CYAN);
            logger.logWithColor(`[Pharmacist] Updated ${loopedOverDrugs} drug items now have x${drugMulti} uses.`, LogTextColor.CYAN);
            logger.logWithColor(`[Pharmacist] Scaled barter counts for ${totalTradersUpdated} items.`, LogTextColor.CYAN);
            logger.logWithColor(`[Pharmacist] Changed ${totalRecipesUpdated} hideout recipes.`, LogTextColor.CYAN);

        }
    }
}

declare var module: any;
module.exports = { mod: new Mod() }
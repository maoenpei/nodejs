
require("../Base");
var assert = require("assert");

Database = {};

Database.cardInfo = function(card) {
    return {
        isBenefit: card == 1 || card == 4 || card == 6,
        isHarm: card == 2 || card == 3 || card == 5,
        isGold: card == 1,
        isBad: card == 2 || card == 3,
        isGood: card == 4,
        isDismissGood: card == 5,
        isDismissBad: card == 6,
        cardType: card,
    };
}

Database.goblinInfo = function(id) {
    var iId = Number(id) % 1000000;
    var reduceInfo = this.goblin_reduce[Math.floor(iId / 10000)];
    var goblin_info = this.goblin_item[iId % 10000];
    if (!reduceInfo || !goblin_info) {
        return null;
    }
    var priceInfo = this.goblin_price[goblin_info.item_id];
    if (typeof(priceInfo) == "object") {
        priceInfo = priceInfo[goblin_info.buy];
    }
    var price = (priceInfo == 10000 ? 0 : priceInfo * goblin_info.count) / goblin_info.buy;
    return {
        reduce: reduceInfo,
        itemName: goblin_info.item_id,
        buyCount: goblin_info.count,
        useDiamond: goblin_info.buy == 2,
        price: price,
    };
}

Database.heroInfo = function(id) {
    if (!this.heros[id]) {
        return null;
    }
    return this.heros[id];
}

Database.allHeros = function(minLevel, maxLevel) {
    var heros = [];
    for (var id in this.heros) {
        var heroData = this.heros[id];
        var matchLevel = ((!minLevel || heroData.level >= minLevel) && (!maxLevel || heroData.level <= maxLevel));
        if (matchLevel) {
            heros.push({
                id: id,
                name: heroData.name,
                cls: heroData.cls,
            });
        }
    }
    return heros;
}

Database.randHero = function() {
    if (!this.heroIds) {
        this.heroIds = [];
        for (var id in this.heros) {
            this.heroIds.push(id);
        }
    }
    var randId = this.heroIds.random();
    var heroData = this.heros[randId];
    return {
        id: randId,
        name: heroData.name,
        cls: heroData.cls,
    };
}

Database.heroCardInfo = function(sysid) {
    var heroid_base = "hero_";
    if (sysid.substr(0, heroid_base.length) != heroid_base) {
        return null;
    }
    var heroid = sysid.substr(heroid_base.length);
    return this.heros[heroid];
}

Database.itemInfo = function(sysid) {
    var heroId = undefined;
    for (var i = 0; i < this.herobase.length; ++i) {
        var id_base = this.herobase[i];
        if (sysid.substr(0, id_base.length) == id_base && Number(sysid.substr(id_base.length, 1)) > 0) {
            heroId = sysid.substr(id_base.length);
            sysid = sysid.substr(0, id_base.length + 1);
            break;
        }
    }
    for (var equip_base in this.equipbase) {
        if (sysid.substr(0, equip_base.length) == equip_base) {
            return this.equipbase[equip_base];
        }
    }
    var item_info = this.items[sysid];
    if (!item_info) {
        return null;
    }
    return {
        name: item_info.name,
        piece: item_info.piece,
        use: item_info.use,
        heroId: heroId,
    };
}

Database.heroCollectInfo = function(heroName) {
    return this.collects_managed[heroName];
},

Database.weaponUpdateCount = function(level, weaponNumber) {
    var last = this.weapon_costs.last;
    if (level >= last.level) {
        return Math.floor(weaponNumber / last.cost);
    }
    var currTotal = this.weapon_costs[level] + weaponNumber;
    var diffTotal = currTotal - last.total;
    if (diffTotal >= 0) {
        return last.level - level + Math.floor(diffTotal / last.cost);
    }
    for (var i = last.level - 1; i > level; --i) {
        if (currTotal >= this.weapon_costs[i]) {
            return i - level;
        }
    }
    // cannot reach!
    return 0;
}

Database.foodExp = function(sysid, count) {
    var food_exp = this.foods[sysid];
    return count * (food_exp ? food_exp : 0);
}

Database.expLevel = function(currLevel, totalExp) {
    var exp = (currLevel < 5 ? totalExp - this.level_coefs.base_diff[currLevel] : totalExp);
    for (var i = 0; i < this.level_coefs.length; ++i) {
        var level_coef = this.level_coefs[i];
        if (level_coef.level_end < currLevel) {
            continue;
        }
        var start = (level_coef.level_start < currLevel ? currLevel : level_coef.level_start);
        var endExp = level_coef.level_diff_to_exp(start, level_coef.level_end);
        if (exp < endExp) {
            return level_coef.exp_to_level_target(start, exp);
        }
        exp -= endExp;
    }
    return 600;
}

Database.levelExp = function(currLevel, targetLevel) {
    var exp = (currLevel < 5 ? this.level_coefs.base_diff[currLevel] : 0);
    for (var i = 0; i < this.level_coefs.length; ++i) {
        var level_coef = this.level_coefs[i];
        if (level_coef.level_end < currLevel) {
            continue;
        }
        if (level_coef.level_start >= targetLevel) {
            break;
        }
        var start = (level_coef.level_start < currLevel ? currLevel : level_coef.level_start);
        var end = (level_coef.level_end > targetLevel ? targetLevel : level_coef.level_end);
        exp += level_coef.level_diff_to_exp(start, end);
    }
    return exp;
}

Database.items = {
    "hero_card_piece_2":{name:"绿色特定勇者卡碎片", piece:10, },
    "hero_card_piece_3":{name:"蓝色特定勇者卡碎片", piece:10, },
    "hero_card_piece_4":{name:"紫色特定勇者卡碎片", piece:10, },
    "hero_card_piece_5":{name:"橙色特定勇者卡碎片", piece:30, },
    "hero_card_piece_6":{name:"红色特定勇者卡碎片", piece:50, },
    "hero_card_piece_7":{name:"金色特定勇者卡碎片", piece:100, },
    "hero_1":{name:"勇者卡", },
    "hero_2":{name:"勇者卡", },
    "hero_3":{name:"勇者卡", },
    "hero_4":{name:"勇者卡", },
    "hero_5":{name:"勇者卡", },
    "hero_6":{name:"勇者卡", },
    "hero_7":{name:"勇者卡", },
    "hero_8":{name:"勇者卡", },

    "coin":{name:"万金币", },

    "miaoli_1":{name:"喵丽神社1元券", },
    "miaoli_2":{name:"喵丽神社6元券", },
    "miaoli_3":{name:"喵丽神社12元券", },
    "summon_book":{name:"勇者契约书", },
    "charge_gift_week_5":{name:"魔法宝箱III", use:true},
    "league_war_horn":{name:"国战笑脸", },
    "league_war_life":{name:"国战旗帜", },
    "magical_girl_book_2":{name:"资深魔女书", },
    "magical_girl_book_3":{name:"传说魔女书", },
    "dungeon_dice":{name:"秘境骰子", },
    "hero_upgrade_card":{name:"主角进化卡", },
    "hero_upgrade_card_piece":{name:"主角进化卡碎片", piece: 50, },
    "special_coin":{name:"特典币", },
    "x_coin":{name:"暗金币", },
    "ticket_card_1":{name:"5点钻石", use:true, },
    "meal_lunch":{name:"豪华午餐", use:true, },
    "meal_supper":{name:"豪华晚餐", use:true, },
    "food_2":{name:"梅子饭团", },
    "food_3":{name:"爱心便当", },
    "food_4":{name:"魔能汉堡", },
    "food_5":{name:"泡椒喵蛋", },
    "food_6":{name:"龙肉", },
    "coin_card_1":{name:"5w金砖", use:true, },
    "coin_card_2":{name:"20w金砖", use:true, },
    "coin_card_3":{name:"88w金砖", use:true, },
    "hero_card_random_2":{name:"绿色勇者卡", use:true, },
    "hero_card_random_3":{name:"蓝色勇者卡", use:true, },
    "hero_card_random_4":{name:"紫色勇者卡", use:true, },
    "hero_card_random_5":{name:"橙色勇者卡", use:true, },
    "hero_card_random_6":{name:"红色勇者卡", use:true, },
    "hero_card_random_7":{name:"金色勇者卡", use:true, },
    "hero_card_random_piece_2":{name:"绿色勇者卡碎片", piece:10, },
    "hero_card_random_piece_3":{name:"蓝色勇者卡碎片", piece:10, },
    "hero_card_random_piece_4":{name:"紫色勇者卡碎片", piece:10, },
    "hero_card_random_piece_5":{name:"橙色勇者卡碎片", piece:30, },
    "hero_card_random_piece_6":{name:"红色勇者卡碎片", piece:50, },
    "hero_card_random_piece_7":{name:"金色勇者卡碎片", piece:100, },
    "master_scroll_1":{name:"刺客专精", },
    "master_scroll_2":{name:"弓手专精", },
    "master_scroll_3":{name:"法师专精", },
    "master_scroll_4":{name:"战士专精", },
    "master_scroll_5":{name:"医者专精", },
    "sp_weapon_soul_stone":{name:"宝具魂石", },
    "sp_weapon_awake_stone":{name:"觉醒石", },
    "sp_weapon_material_1":{name:"刺客精华", },
    "sp_weapon_material_2":{name:"弓手精华", },
    "sp_weapon_material_3":{name:"法师精华", },
    "sp_weapon_material_4":{name:"战士精华", },
    "sp_weapon_material_5":{name:"医者精华", },
    "stone_atk_2":{name:"绿色强攻石", },
    "stone_crit_2":{name:"绿色致命石", },
    "stone_def_2":{name:"绿色守护石", },
    "stone_dodge_2":{name:"绿色精巧石", },
    "stone_hit_2":{name:"绿色鹰眼石", },
    "stone_hp_2":{name:"绿色生命石", },
    "stone_speed_2":{name:"绿色疾风石", },
    "stone_tenacity_2":{name:"绿色恩惠石", },
    "stone_atk_3":{name:"蓝色强攻石", },
    "stone_crit_3":{name:"蓝色致命石", },
    "stone_def_3":{name:"蓝色守护石", },
    "stone_dodge_3":{name:"蓝色精巧石", },
    "stone_hit_3":{name:"蓝色鹰眼石", },
    "stone_hp_3":{name:"蓝色生命石", },
    "stone_speed_3":{name:"蓝色疾风石", },
    "stone_tenacity_3":{name:"蓝色恩惠石", },
    "stone_piece_atk_3":{name:"蓝色强攻石碎片", piece:5, },
    "stone_piece_crit_3":{name:"蓝色致命石碎片", piece:5, },
    "stone_piece_def_3":{name:"蓝色守护石碎片", piece:5, },
    "stone_piece_dodge_3":{name:"蓝色精巧石碎片", piece:5, },
    "stone_piece_hit_3":{name:"蓝色鹰眼石碎片", piece:5, },
    "stone_piece_hp_3":{name:"蓝色生命石碎片", piece:5, },
    "stone_piece_speed_3":{name:"蓝色疾风石碎片", piece:5, },
    "stone_piece_tenacity_3":{name:"蓝色恩惠石碎片", piece:5, },
    "stone_atk_4":{name:"紫色强攻石", },
    "stone_crit_4":{name:"紫色致命石", },
    "stone_def_4":{name:"紫色守护石", },
    "stone_dodge_4":{name:"紫色精巧石", },
    "stone_hit_4":{name:"紫色鹰眼石", },
    "stone_hp_4":{name:"紫色生命石", },
    "stone_speed_4":{name:"紫色疾风石", },
    "stone_tenacity_4":{name:"紫色恩惠石", },
    "stone_piece_atk_4":{name:"紫色强攻石碎片", piece:10, },
    "stone_piece_crit_4":{name:"紫色致命石碎片", piece:10, },
    "stone_piece_def_4":{name:"紫色守护石碎片", piece:10, },
    "stone_piece_dodge_4":{name:"紫色精巧石碎片", piece:10, },
    "stone_piece_hit_4":{name:"紫色鹰眼石碎片", piece:10, },
    "stone_piece_hp_4":{name:"紫色生命石碎片", piece:10, },
    "stone_piece_speed_4":{name:"紫色疾风石碎片", piece:10, },
    "stone_piece_tenacity_4":{name:"紫色恩惠石碎片", piece:10, },
    "stone_atk_5":{name:"橙色强攻石", },
    "stone_crit_5":{name:"橙色致命石", },
    "stone_def_5":{name:"橙色守护石", },
    "stone_dodge_5":{name:"橙色精巧石", },
    "stone_hit_5":{name:"橙色鹰眼石", },
    "stone_hp_5":{name:"橙色生命石", },
    "stone_speed_5":{name:"橙色疾风石", },
    "stone_tenacity_5":{name:"橙色恩惠石", },
    "stone_piece_atk_5":{name:"橙色强攻石碎片", piece:20, },
    "stone_piece_crit_5":{name:"橙色致命石碎片", piece:20, },
    "stone_piece_def_5":{name:"橙色守护石碎片", piece:20, },
    "stone_piece_dodge_5":{name:"橙色精巧石碎片", piece:20, },
    "stone_piece_hit_5":{name:"橙色鹰眼石碎片", piece:20, },
    "stone_piece_hp_5":{name:"橙色生命石碎片", piece:20, },
    "stone_piece_speed_5":{name:"橙色疾风石碎片", piece:20, },
    "stone_piece_tenacity_5":{name:"橙色恩惠石碎片", piece:20, },
    "stone_atk_6":{name:"红色强攻石", },
    "stone_crit_6":{name:"红色致命石", },
    "stone_def_6":{name:"红色守护石", },
    "stone_dodge_6":{name:"红色精巧石", },
    "stone_hit_6":{name:"红色鹰眼石", },
    "stone_hp_6":{name:"红色生命石", },
    "stone_speed_6":{name:"红色疾风石", },
    "stone_tenacity_6":{name:"红色恩惠石", },
    "stone_piece_atk_6":{name:"红色强攻石碎片", piece:30, },
    "stone_piece_crit_6":{name:"红色致命石碎片", piece:30, },
    "stone_piece_def_6":{name:"红色守护石碎片", piece:30, },
    "stone_piece_dodge_6":{name:"红色精巧石碎片", piece:30, },
    "stone_piece_hit_6":{name:"红色鹰眼石碎片", piece:30, },
    "stone_piece_hp_6":{name:"红色生命石碎片", piece:30, },
    "stone_piece_speed_6":{name:"红色疾风石碎片", piece:30, },
    "stone_piece_tenacity_6":{name:"红色恩惠石碎片", piece:30, },
    "stone_atk_7":{name:"金色强攻石", },
    "stone_crit_7":{name:"金色致命石", },
    "stone_def_7":{name:"金色守护石", },
    "stone_dodge_7":{name:"金色精巧石", },
    "stone_hit_7":{name:"金色鹰眼石", },
    "stone_hp_7":{name:"金色生命石", },
    "stone_speed_7":{name:"金色疾风石", },
    "stone_tenacity_7":{name:"金色恩惠石", },
    "stone_piece_atk_7":{name:"金色强攻石碎片", piece:30, },
    "stone_piece_crit_7":{name:"金色致命石碎片", piece:30, },
    "stone_piece_def_7":{name:"金色守护石碎片", piece:30, },
    "stone_piece_dodge_7":{name:"金色精巧石碎片", piece:30, },
    "stone_piece_hit_7":{name:"金色鹰眼石碎片", piece:30, },
    "stone_piece_hp_7":{name:"金色生命石碎片", piece:30, },
    "stone_piece_speed_7":{name:"金色疾风石碎片", piece:30, },
    "stone_piece_tenacity_7":{name:"金色恩惠石碎片", piece:30, },
    "stone_atk_8":{name:"暗金强攻石", },
    "stone_crit_8":{name:"暗金致命石", },
    "stone_def_8":{name:"暗金守护石", },
    "stone_dodge_8":{name:"暗金精巧石", },
    "stone_hit_8":{name:"暗金鹰眼石", },
    "stone_hp_8":{name:"暗金生命石", },
    "stone_speed_8":{name:"暗金疾风石", },
    "stone_tenacity_8":{name:"暗金恩惠石", },
    "stone_piece_atk_8":{name:"暗金强攻石碎片", piece:50, },
    "stone_piece_crit_8":{name:"暗金致命石碎片", piece:50, },
    "stone_piece_def_8":{name:"暗金守护石碎片", piece:50, },
    "stone_piece_dodge_8":{name:"暗金精巧石碎片", piece:50, },
    "stone_piece_hit_8":{name:"暗金鹰眼石碎片", piece:50, },
    "stone_piece_hp_8":{name:"暗金生命石碎片", piece:50, },
    "stone_piece_speed_8":{name:"暗金疾风石碎片", piece:50, },
    "stone_piece_tenacity_8":{name:"暗金恩惠石碎片", piece:50, },
    "stone_piece_random_2":{name:"绿色随机石碎片", use:true, },
    "stone_piece_random_3":{name:"蓝色随机石碎片", use:true, },
    "stone_piece_random_4":{name:"紫色随机石碎片", use:true, },
    "stone_piece_random_5":{name:"橙色随机石碎片", use:true, },
    "stone_piece_random_6":{name:"红色随机石碎片", use:true, },
    "stone_piece_random_7":{name:"金色随机石碎片", use:true, },
    "equip_compose_1_any":{name:"精铁锭", },
    "equip_compose_1_a":{name:"1阶武具图纸", },
    "equip_compose_1_b":{name:"1阶防具图纸", },
    "equip_compose_1_c":{name:"1阶饰品图纸", },
    "equip_compose_1_extra":{name:"1阶龙石", },
    "equip_compose_2_any":{name:"红钢锭", },
    "equip_compose_2_a":{name:"2阶武具图纸", },
    "equip_compose_2_b":{name:"2阶防具图纸", },
    "equip_compose_2_c":{name:"2阶饰品图纸", },
    "equip_compose_2_extra":{name:"2阶龙石", },
    "equip_compose_3_any":{name:"秘银锭", },
    "equip_compose_3_a":{name:"3阶武具图纸", },
    "equip_compose_3_b":{name:"3阶防具图纸", },
    "equip_compose_3_c":{name:"3阶饰品图纸", },
    "equip_compose_3_extra":{name:"3阶龙石", },
    "equip_compose_4_any":{name:"神金锭", },
    "equip_compose_4_a":{name:"4阶武具图纸", },
    "equip_compose_4_b":{name:"4阶防具图纸", },
    "equip_compose_4_c":{name:"4阶饰品图纸", },
    "equip_compose_4_extra":{name:"4阶龙石", },
};

Database.herobase = [
    "hero_card_piece_",
    "hero_",
];

Database.equipbase = {
    "amulet":{name:"护身符"},
    "armor":{name:"护肩"},
    "boots":{name:"靴子"},
    "certificate":{name:"证书"},
    "legs":{name:"护腿"},
    "mask":{name:"面罩"},
    "pet":{name:"宠物"},
    "ring":{name:"戒指"},
    "shield":{name:"盾牌"},
    "weapon":{name:"武器"},
};

Database.goblin_item = {
    "1":{item_id:"coin", count:1000, buy:2, },
    "2":{item_id:"coin", count:500, buy:2, },
    "3":{item_id:"summon_book", count:5, buy:1, },
    "4":{item_id:"summon_book", count:2, buy:1, },
    "5":{item_id:"stone_piece_random_3", count:100, buy:1, },
    "6":{item_id:"stone_piece_random_4", count:100, buy:1, },
    "7":{item_id:"stone_piece_random_5", count:100, buy:1, },
    "8":{item_id:"stone_piece_random_6", count:100, buy:1, },
    "9":{item_id:"stone_piece_random_7", count:100, buy:1, },
    "10":{item_id:"food_2", count:30, buy:1, },
    "11":{item_id:"food_3", count:30, buy:1, },
    "12":{item_id:"food_4", count:30, buy:1, },
    "13":{item_id:"food_5", count:30, buy:1, },
    "14":{item_id:"food_6", count:30, buy:1, },
    "15":{item_id:"dungeon_dice", count:5, buy:1, },
    "16":{item_id:"hero_upgrade_card_piece", count:3, buy:1, },
    "17":{item_id:"summon_book", count:5, buy:2, },
    "18":{item_id:"summon_book", count:2, buy:2, },
    "19":{item_id:"stone_piece_random_3", count:100, buy:2, },
    "20":{item_id:"stone_piece_random_4", count:100, buy:2, },
    "21":{item_id:"stone_piece_random_5", count:100, buy:2, },
    "22":{item_id:"stone_piece_random_6", count:100, buy:2, },
    "23":{item_id:"stone_piece_random_7", count:100, buy:2, },
    "24":{item_id:"food_2", count:30, buy:2, },
    "25":{item_id:"food_3", count:30, buy:2, },
    "26":{item_id:"food_4", count:30, buy:2, },
    "27":{item_id:"food_5", count:30, buy:2, },
    "28":{item_id:"food_6", count:30, buy:2, },
    "29":{item_id:"dungeon_dice", count:5, buy:2, },
    "30":{item_id:"hero_upgrade_card_piece", count:3, buy:2, },
};

Database.goblin_reduce = {
    "9": 8,
    "10": 5,
    "11": 5,
    "12": 3,
};

Database.goblin_price = {
    "coin": 1,
    "summon_book": {"1":480, "2":180},
    "stone_piece_random_3": 10000,
    "stone_piece_random_4": 10000,
    "stone_piece_random_5": 10000,
    "stone_piece_random_6": 24,
    "stone_piece_random_7": 30,
    "food_2": 4,
    "food_3": 10,
    "food_4": 20,
    "food_5": 10000,
    "food_6": 10000,
    "dungeon_dice": 20,
    "hero_upgrade_card_piece": 200,
};

Database.heros = {
    "80001":{name:"妲己", cls:"X", level:10},
    "80002":{name:"哈迪斯", cls:"X", level:10},
    "80003":{name:"路西法", cls:"X", level:10},
    "80004":{name:"伏羲", cls:"X", level:10},
    "80005":{name:"潘多拉", cls:"X", level:10},
    "80006":{name:"美杜莎", cls:"X", level:10},
    "80007":{name:"蚩尤", cls:"X", level:10},
    "80008":{name:"波塞冬", cls:"X", level:10},
    "80009":{name:"苍龙", cls:"X", level:10},
    "80010":{name:"青鸾", cls:"X", level:10},
    "70001":{name:"吾王", cls:"SSS+", level:9},
    "70002":{name:"黑焰射手", cls:"SSS+", level:9},
    "70003":{name:"枭之店长", cls:"SSS+", level:9},
    "70004":{name:"荣耀大剑", cls:"SSS+", level:9},
    "70005":{name:"金木小天使", cls:"SSS+", level:9},
    "70006":{name:"本子娜", cls:"SSS+", level:9},
    "70007":{name:"黑衣剑士", cls:"SSS+", level:9},
    "70008":{name:"雅典娜", cls:"SSS+", level:9},
    "70009":{name:"小狮郎", cls:"SSS+", level:9},
    "70010":{name:"静电萌宠", cls:"SSS+", level:9},
    "70011":{name:"黄色闪光", cls:"SSS+", level:9},
    "70012":{name:"吊车尾大王", cls:"SSS+", level:9},
    "70013":{name:"草帽小子", cls:"SSS+", level:9},
    "70014":{name:"真白骑士姬", cls:"SSS+", level:9},
    "70015":{name:"红发之皇", cls:"SSS+", level:9},
    "70016":{name:"狗哥", cls:"SSS+", level:9},
    "70017":{name:"泰坦神王", cls:"SSS+", level:9},
    "70018":{name:"鼬神", cls:"SSS+", level:9},
    "70019":{name:"银酱", cls:"SSS+", level:9},
    "70020":{name:"基神", cls:"SSS+", level:9},
    "70021":{name:"红之骑士", cls:"SSS", level:8},
    "70022":{name:"欠雷", cls:"SSS", level:8},
    "70023":{name:"吃撑", cls:"SSS", level:8},
    "70024":{name:"披萨魔女", cls:"SSS", level:8},
    "70025":{name:"金色炮姐", cls:"SSS", level:8},
    "70026":{name:"三无少女", cls:"SSS", level:8},
    "70027":{name:"最强佣兵", cls:"SSS", level:8},
    "70028":{name:"大蛇", cls:"SSS", level:8},
    "70029":{name:"片翼天使", cls:"SSS", level:8},
    "70030":{name:"ZERO", cls:"SSS", level:8},
    "70031":{name:"SOS团长", cls:"SSS", level:8},
    "70032":{name:"妖精女王", cls:"SSS", level:8},
    "70033":{name:"孔明", cls:"SSS", level:8},
    "70034":{name:"吕奉先", cls:"SSS", level:8},
    "70035":{name:"小埋", cls:"SSS", level:8},
    "70036":{name:"传说中的肥羊", cls:"SSS", level:8},
    "70037":{name:"超级射击子", cls:"SSS", level:8},
    "70038":{name:"甩葱女神", cls:"SSS", level:8},
    "70039":{name:"Lucy", cls:"SSS", level:8},
    "70040":{name:"拷贝忍者", cls:"SSS", level:8},
    "70041":{name:"海贼猎人", cls:"SSS", level:8},
    "70042":{name:"国王贡", cls:"SSS", level:8},
    "70043":{name:"霍比特小能手", cls:"SSS", level:8},
    "70044":{name:"孙悟空", cls:"SSS", level:8},
    "70045":{name:"月下吸血鬼", cls:"SSS", level:8},
    "70046":{name:"崇明四郎", cls:"SSS", level:8},
    "70047":{name:"北斗霸主", cls:"SSS", level:8},
    "70048":{name:"司令官大哥", cls:"SSS", level:8},
    "70049":{name:"T800", cls:"SSS", level:8},
    "70050":{name:"第一歌姬", cls:"SSS", level:8},
    "70051":{name:"梦幻生物", cls:"SSS", level:8},
    "70052":{name:"双子座", cls:"SSS", level:8},
    "70053":{name:"第六天大魔王", cls:"SSS", level:8},
    "70054":{name:"绿之勇者", cls:"SSS", level:8},
    "73001":{name:"八神庵", cls:"SSS+", level:9},
    "73002":{name:"不知火舞", cls:"SSS+", level:9},
    "73003":{name:"草薙京", cls:"SSS+", level:9},
    "73004":{name:"特瑞", cls:"SSS", level:8},
    "60001":{name:"三爷", cls:"SS+", level:7},
    "60002":{name:"死鱼眼兵长", cls:"SS+", level:7},
    "60003":{name:"迪女神", cls:"SS+", level:7},
    "60004":{name:"金闪闪", cls:"SS+", level:7},
    "60005":{name:"草莓死神", cls:"SS+", level:7},
    "60006":{name:"巨人变身者", cls:"SS+", level:7},
    "60007":{name:"蓝翔挖掘机", cls:"SS", level:6},
    "60009":{name:"杀殿", cls:"SS+", level:7},
    "60010":{name:"二助子", cls:"SS+", level:7},
    "60011":{name:"风岛", cls:"SS+", level:7},
    "60012":{name:"烤鸡制造者", cls:"SS+", level:7},
    "60013":{name:"Poi娘", cls:"SS+", level:7},
    "60014":{name:"召唤女神", cls:"SS+", level:7},
    "60015":{name:"奶挺姐", cls:"SS+", level:7},
    "60016":{name:"艾雪", cls:"SS+", level:7},
    "60017":{name:"圣光冰法", cls:"SS", level:6},
    "60018":{name:"奥观海", cls:"SS", level:6},
    "60019":{name:"普大帝", cls:"SS", level:6},
    "60020":{name:"幻想杀手", cls:"SS", level:6},
    "60021":{name:"冰之魔导", cls:"SS", level:6},
    "60022":{name:"火之魔导", cls:"SS", level:6},
    "60023":{name:"灰袍巫师", cls:"SS", level:6},
    "60024":{name:"白袍巫师", cls:"SS", level:6},
    "60025":{name:"月女", cls:"SS", level:6},
    "60026":{name:"人形蝙蝠", cls:"SS", level:6},
    "60027":{name:"铁桶人", cls:"SS", level:6},
    "60028":{name:"红武士", cls:"SS", level:6},
    "60029":{name:"赛亚小子", cls:"SS", level:6},
    "60030":{name:"传说凹凸曼", cls:"SS", level:6},
    "60031":{name:"刺猬", cls:"SS", level:6},
    "60032":{name:"雷神", cls:"SS", level:6},
    "60033":{name:"赛亚王子", cls:"SS", level:6},
    "60034":{name:"精灵王子", cls:"SS", level:6},
    "60035":{name:"最强小丑", cls:"SS", level:6},
    "60036":{name:"终极程序", cls:"SS", level:6},
    "60037":{name:"超级英雄", cls:"SS", level:6},
    "60038":{name:"见神杀神", cls:"SS", level:6},
    "60039":{name:"火拳哥哥", cls:"SS", level:6},
    "60040":{name:"恶魔猎手", cls:"SS+", level:7},
    "60041":{name:"巫妖王", cls:"SS+", level:7},
    "50001":{name:"凛酱", cls:"S+", level:5},
    "50002":{name:"补魔高手", cls:"S", level:4},
    "50003":{name:"樱之万解", cls:"S+", level:5},
    "50004":{name:"国民老公", cls:"S", level:4},
    "50005":{name:"神兽", cls:"S", level:4},
    "50006":{name:"炎发灼眼", cls:"S+", level:5},
    "50007":{name:"白雪之刃", cls:"S+", level:5},
    "50008":{name:"小贼猫", cls:"S", level:4},
    "50009":{name:"黑足厨师", cls:"S", level:4},
    "50010":{name:"电磁炮少女", cls:"S+", level:5},
    "50011":{name:"小香酱", cls:"S+", level:5},
    "50012":{name:"福音眼镜娘", cls:"S", level:4},
    "50013":{name:"苍老师", cls:"S", level:4},
    "50014":{name:"波多野老师", cls:"S", level:4},
    "50015":{name:"小豆丁", cls:"S+", level:5},
    "50016":{name:"盔甲弟弟", cls:"S", level:4},
    "50019":{name:"咆哮斧王", cls:"S", level:4},
    "50020":{name:"四魂巫女", cls:"S+", level:5},
    "50021":{name:"神枪手", cls:"S", level:4},
    "50022":{name:"李大侠", cls:"S", level:4},
    "50023":{name:"女娲末裔", cls:"S", level:4},
    "50024":{name:"白疯", cls:"S", level:4},
    "50025":{name:"红疯", cls:"S", level:4},
    "50026":{name:"程序猿", cls:"S", level:4},
    "50027":{name:"阿篱", cls:"S", level:4},
    "50028":{name:"关云长", cls:"S+", level:5},
    "50029":{name:"曹孟德", cls:"S", level:4},
    "50030":{name:"主公", cls:"S", level:4},
    "50031":{name:"赵子龙", cls:"S", level:4},
    "50032":{name:"张翼德", cls:"S", level:4},
    "50033":{name:"貂蝉", cls:"S", level:4},
    "50034":{name:"孙仲谋", cls:"S", level:4},
    "50035":{name:"新一姬", cls:"S", level:4},
    "50036":{name:"快斗", cls:"S", level:4},
    "50037":{name:"大艾", cls:"S", level:4},
    "50038":{name:"格斗警察", cls:"S", level:4},
    "50039":{name:"米国队长", cls:"S", level:4},
    "50040":{name:"吸血鬼猎人", cls:"S", level:4},
    "50041":{name:"亚马逊女侠", cls:"S", level:4},
    "50042":{name:"我流武士", cls:"S", level:4},
    "50043":{name:"高杉晋作", cls:"S", level:4},
    "50044":{name:"元祖凹凸曼", cls:"S", level:4},
    "50045":{name:"猴子", cls:"S", level:4},
    "50046":{name:"混沌", cls:"S", level:4},
    "50047":{name:"老鼠大湿", cls:"S", level:4},
    "50048":{name:"草丛论", cls:"S", level:4},
    "50049":{name:"水之魔导", cls:"S", level:4},
    "50050":{name:"坂本龙马", cls:"S", level:4},
    "50051":{name:"卡咖喱", cls:"S", level:4},
    "50052":{name:"银蛇", cls:"S", level:4},
    "50053":{name:"绿之巨人", cls:"S", level:4},
    "50054":{name:"小樱", cls:"S", level:4},
    "50055":{name:"绝地天行者", cls:"S", level:4},
    "50056":{name:"水枪龟", cls:"S", level:4},
    "50057":{name:"蛤蛤草", cls:"S", level:4},
    "50058":{name:"喷火龙", cls:"S", level:4},
    "50059":{name:"汽车恶霸", cls:"S", level:4},
    "50060":{name:"麋鹿医生", cls:"S", level:4},
    "50061":{name:"米花娃娃", cls:"S", level:4},
    "50062":{name:"helloBunny", cls:"S", level:4},
    "50063":{name:"加肥猫", cls:"S", level:4},
    "50064":{name:"积木英雄", cls:"S", level:4},
    "50065":{name:"黑胡海皇", cls:"S", level:4},
    "50066":{name:"蓝焰射手", cls:"S", level:4},
    "30020":{name:"葡萄味葫芦", cls:"A", level:3},
    "30021":{name:"薄荷味葫芦", cls:"A", level:3},
    "30022":{name:"蓝莓味葫芦", cls:"A", level:3},
    "30023":{name:"黄瓜味葫芦", cls:"A", level:3},
    "30024":{name:"柠檬味葫芦", cls:"A", level:3},
    "30025":{name:"橘子味葫芦", cls:"A", level:3},
    "30026":{name:"草莓味葫芦", cls:"A", level:3},
    "40001":{name:"初号驾驶员", cls:"A", level:3},
    "40002":{name:"第十七使徒", cls:"A", level:3},
    "40003":{name:"补完部长", cls:"A", level:3},
    "40004":{name:"鬼蜘蛛", cls:"A", level:3},
    "40005":{name:"哆啦大雄", cls:"A", level:3},
    "40006":{name:"哆啦B梦", cls:"A", level:3},
    "40007":{name:"水管工", cls:"A", level:3},
    "40008":{name:"龙日天", cls:"A", level:3},
    "40009":{name:"大白", cls:"A", level:3},
    "40010":{name:"提百万", cls:"A", level:3},
    "40011":{name:"黄忠", cls:"A", level:3},
    "40012":{name:"马超", cls:"A", level:3},
    "40013":{name:"加勒比船长", cls:"A", level:3},
    "40014":{name:"剑心薰", cls:"A", level:3},
    "40015":{name:"山羊座", cls:"A", level:3},
    "40016":{name:"小艾", cls:"A", level:3},
    "40017":{name:"大黄蜂", cls:"A", level:3},
    "40018":{name:"紫菜包", cls:"A", level:3},
    "40019":{name:"蓝罐曲奇", cls:"A", level:3},
    "40020":{name:"红豆冰", cls:"A", level:3},
    "40021":{name:"新奇士", cls:"A", level:3},
    "40022":{name:"绿色小朋友", cls:"A", level:3},
    "40023":{name:"黄宝宝棉", cls:"A", level:3},
    "40024":{name:"幼年唐僧", cls:"A", level:3},
    "40025":{name:"S星王子", cls:"A", level:3},
    "40026":{name:"学霸", cls:"A", level:3},
    "40027":{name:"土方", cls:"A", level:3},
    "40028":{name:"女装大佬", cls:"A", level:3},
    "40029":{name:"大眼萌1号", cls:"A", level:3},
    "40030":{name:"大眼萌2号", cls:"A", level:3},
    "40031":{name:"斑点人造人", cls:"A", level:3},
    "40032":{name:"钢大木", cls:"A", level:3},
    "40033":{name:"火星公主", cls:"A", level:3},
    "40034":{name:"月球公主", cls:"A", level:3},
    "40035":{name:"水星公主", cls:"A", level:3},
    "40036":{name:"木星公主", cls:"A", level:3},
    "40037":{name:"金星公主", cls:"A", level:3},
    "40038":{name:"备胎", cls:"A", level:3},
    "40039":{name:"胖乙", cls:"A", level:3},
    "40040":{name:"潮汐鱼人", cls:"A", level:3},
    "40041":{name:"Egg张", cls:"A", level:3},
    "40042":{name:"二师弟", cls:"A", level:3},
    "40043":{name:"滑板鞋", cls:"A", level:3},
    "40044":{name:"克隆人", cls:"A", level:3},
    "40045":{name:"王司徒", cls:"A", level:3},
    "40046":{name:"水瓶座", cls:"A", level:3},
    "40047":{name:"碰瓷老汉", cls:"A", level:3},
    "40048":{name:"龟壳大魔王", cls:"A", level:3},
    "40049":{name:"生化特工", cls:"A", level:3},
    "40050":{name:"白羊座", cls:"A", level:3},
    "40051":{name:"小白龙", cls:"A", level:3},
    "40052":{name:"小宏", cls:"A", level:3},
    "40053":{name:"郭达斯坦森", cls:"A", level:3},
    "40054":{name:"第一滴血", cls:"A", level:3},
    "40055":{name:"功夫皇帝", cls:"A", level:3},
    "40056":{name:"隔壁老王", cls:"A", level:3},
    "40057":{name:"蛋刀猎手", cls:"A", level:3},
    "13001":{name:"幼年提莫", cls:"B", level:2},
    "13002":{name:"小娜美", cls:"B", level:2},
    "13003":{name:"人形态乔巴", cls:"B", level:2},
    "30001":{name:"女司机", cls:"B", level:2},
    "30002":{name:"广场舞大妈", cls:"B", level:2},
    "30003":{name:"踏平东京", cls:"B", level:2},
    "30004":{name:"蜡笔熊孩子", cls:"B", level:2},
    "30009":{name:"糖baby", cls:"B", level:2},
    "30010":{name:"诗剑双绝", cls:"B", level:2},
    "30011":{name:"企鹅仔", cls:"B", level:2},
    "30012":{name:"度娘", cls:"B", level:2},
    "30013":{name:"谷哥", cls:"B", level:2},
    "30014":{name:"天喵", cls:"B", level:2},
    "30015":{name:"撒旦", cls:"B", level:2},
    "30016":{name:"服部半藏", cls:"B", level:2},
    "30017":{name:"莉莉丝", cls:"B", level:2},
    "30018":{name:"水管工小弟", cls:"B", level:2},
    "30019":{name:"哈迪斯", cls:"B", level:2},
    "30027":{name:"城堡卫士", cls:"B", level:2},
    "30028":{name:"长鼻子", cls:"B", level:2},
    "30029":{name:"重甲骑士", cls:"B", level:2},
    "30030":{name:"盗宝地精", cls:"B", level:2},
    "30031":{name:"母狼狗", cls:"B", level:2},
    "30032":{name:"魔法学徒", cls:"B", level:2},
    "30033":{name:"钢锻精英卫士", cls:"B", level:2},
    "30034":{name:"武器商人", cls:"B", level:2},
    "12001":{name:"小总悟", cls:"C", level:1},
    "12002":{name:"少年银酱", cls:"C", level:1},
    "12003":{name:"穿越前的戈薇", cls:"C", level:1},
    "12004":{name:"锅铲大黄蜂", cls:"C", level:1},
    "20001":{name:"熊孩子", cls:"C", level:1},
    "20002":{name:"宅男", cls:"C", level:1},
    "20003":{name:"史莱姆大王", cls:"C", level:1},
    "20004":{name:"喵星人", cls:"C", level:1},
    "20005":{name:"围观群众", cls:"C", level:1},
    "20006":{name:"路人甲", cls:"C", level:1},
    "20007":{name:"格巫巫", cls:"C", level:1},
    "20008":{name:"龙套", cls:"C", level:1},
    "20009":{name:"杂兵", cls:"C", level:1},
    "20010":{name:"骷髅战士", cls:"C", level:1},
    "20011":{name:"骷髅弓箭手", cls:"C", level:1},
    "20012":{name:"丛林史莱姆", cls:"C", level:1},
    "20013":{name:"小狼狗", cls:"C", level:1},
    "20014":{name:"打工仔", cls:"C", level:1},
    "20015":{name:"平原史莱姆", cls:"C", level:1},
    "20017":{name:"杂兵头目", cls:"C", level:1},
    "20018":{name:"游戏菜鸟", cls:"C", level:1},
    "20019":{name:"野狼", cls:"C", level:1},
    "20020":{name:"骷髅法师", cls:"C", level:1},
    "20021":{name:"巨人", cls:"C", level:1},
    "20022":{name:"大野狼", cls:"C", level:1},
    "20023":{name:"弓雾猿", cls:"C", level:1},
    "20024":{name:"石头人", cls:"C", level:1},
    "20025":{name:"天使丘比特", cls:"C", level:1},
    "20026":{name:"单身狗", cls:"C", level:1},
    "20027":{name:"魅魔", cls:"C", level:1},
};

Database.collects = {
    "20001": {
      "0": "hero_20003",
      "1": "hero_20012",
      "2": "hero_20015"
    },
    "20002": {
      "0": "hero_20005",
      "1": "hero_20006",
      "2": "hero_20008"
    },
    "20003": {
      "0": "hero_20026",
      "1": "hero_20013",
      "2": "hero_30031",
      "3": "hero_20019",
      "4": "hero_20022"
    },
    "30001": {
      "0": "hero_30026",
      "1": "hero_30025",
      "2": "hero_30024",
      "3": "hero_30023",
      "4": "hero_30022",
      "5": "hero_30021",
      "6": "hero_30020"
    },
    "30002": {
      "0": "hero_40007",
      "1": "hero_30018"
    },
    "30003": {
      "0": "hero_30012",
      "1": "hero_30013"
    },
    "30004": {
      "0": "hero_30011",
      "1": "hero_30014",
      "2": "hero_30030"
    },
    "30005": {
      "0": "hero_40047",
      "1": "hero_30001",
      "2": "hero_30002",
      "3": "hero_30003",
      "4": "hero_20001"
    },
    "30006": {
      "0": "hero_30009",
      "1": "hero_30004",
      "2": "hero_20004",
      "3": "hero_30017"
    },
    "30007": {
      "0": "hero_33001",
      "1": "hero_33002",
      "2": "hero_33003",
      "3": "hero_33004"
    },
    "40001": {
      "0": "hero_50045",
      "1": "hero_40024",
      "2": "hero_40042",
      "3": "hero_40051"
    },
    "40002": {
      "0": "hero_40052",
      "1": "hero_40009"
    },
    "40003": {
      "0": "hero_40001",
      "1": "hero_40002",
      "2": "hero_40003",
      "3": "hero_50011",
      "4": "hero_50012"
    },
    "40004": {
      "0": "hero_40025",
      "1": "hero_40027",
      "2": "hero_50043",
      "3": "hero_50050"
    },
    "40005": {
      "0": "hero_50028",
      "1": "hero_50031",
      "2": "hero_50032",
      "3": "hero_40011",
      "4": "hero_40012"
    },
    "40006": {
      "0": "hero_40033",
      "1": "hero_40034",
      "2": "hero_40035",
      "3": "hero_40036",
      "4": "hero_40037"
    },
    "40007": {
      "0": "hero_40018",
      "1": "hero_40019",
      "2": "hero_40020",
      "3": "hero_40021",
      "4": "hero_50047"
    },
    "40008": {
      "0": "hero_50037",
      "1": "hero_40015",
      "2": "hero_40016",
      "3": "hero_40046",
      "4": "hero_40050"
    },
    "40009": {
      "0": "hero_40045",
      "1": "hero_40041",
      "2": "hero_40008",
      "3": "hero_40043",
      "4": "hero_40056"
    },
    "40010": {
      "0": "hero_50048",
      "1": "hero_40010"
    },
    "40011": {
      "0": "hero_40005",
      "1": "hero_40006"
    },
    "40012": {
      "0": "hero_40029",
      "1": "hero_40030"
    },
    "40013": {
      "0": "hero_40053",
      "1": "hero_40054",
      "2": "hero_40055"
    },
    "40014": {
      "0": "hero_40049",
      "1": "hero_40014"
    },
    "40015": {
      "0": "hero_40040",
      "1": "hero_40048"
    },
    "40016": {
      "0": "hero_40038",
      "1": "hero_40026"
    },
    "40017": {
      "0": "hero_40044",
      "1": "hero_40022",
      "2": "hero_50055"
    },
    "40018": {
      "0": "hero_40023",
      "1": "hero_40039",
      "2": "hero_50064"
    },
    "50001": {
      "0": "hero_50021",
      "1": "hero_50004"
    },
    "50002": {
      "0": "hero_50001",
      "1": "hero_50002"
    },
    "50003": {
      "0": "hero_50056",
      "1": "hero_50057",
      "2": "hero_50058"
    },
    "50004": {
      "0": "hero_50024",
      "1": "hero_50025"
    },
    "50005": {
      "0": "hero_50008",
      "1": "hero_50009",
      "2": "hero_50060"
    },
    "50006": {
      "0": "hero_50003",
      "1": "hero_50007"
    },
    "50008": {
      "0": "hero_50013",
      "1": "hero_50014"
    },
    "50009": {
      "0": "hero_50020",
      "1": "hero_50027"
    },
    "50010": {
      "0": "hero_50029",
      "1": "hero_50030",
      "2": "hero_50034"
    },
    "50011": {
      "0": "hero_50015",
      "1": "hero_50016"
    },
    "50012": {
      "0": "hero_50035",
      "1": "hero_50036"
    },
    "50013": {
      "0": "hero_50022",
      "1": "hero_50023"
    },
    "50016": {
      "0": "hero_40017",
      "1": "hero_50059"
    },
    "50017": {
      "0": "hero_40032",
      "1": "hero_50051"
    },
    "50018": {
      "0": "hero_50038",
      "1": "hero_40028"
    },
    "50019": {
      "0": "hero_40004",
      "1": "hero_50052",
      "2": "hero_50046",
      "3": "hero_40031"
    },
    "50020": {
      "0": "hero_50062",
      "1": "hero_50063"
    },
    "50021": {
      "0": "hero_50006",
      "1": "hero_50010",
      "2": "hero_50054",
      "3": "hero_50061",
      "4": "hero_50049"
    },
    "50022": {
      "0": "hero_50041",
      "1": "hero_50053",
      "2": "hero_50019"
    },
    "50023": {
      "0": "hero_50042",
      "1": "hero_50039",
      "2": "hero_50044",
      "3": "hero_50040"
    },
    "60001": {
      "0": "hero_70009",
      "1": "hero_60005"
    },
    "60002": {
      "0": "hero_70004",
      "1": "hero_60003"
    },
    "60003": {
      "0": "hero_70016",
      "1": "hero_60009"
    },
    "60004": {
      "0": "hero_70012",
      "1": "hero_70040",
      "2": "hero_60010"
    },
    "60005": {
      "0": "hero_70022",
      "1": "hero_70023"
    },
    "60006": {
      "0": "hero_70032",
      "1": "hero_70039",
      "2": "hero_60021",
      "3": "hero_60022"
    },
    "60007": {
      "0": "hero_60014",
      "1": "hero_60015",
      "2": "hero_60016"
    },
    "60008": {
      "0": "hero_70042",
      "1": "hero_70043",
      "2": "hero_60023",
      "3": "hero_60024",
      "4": "hero_60034"
    },
    "60009": {
      "0": "hero_70044",
      "1": "hero_60029",
      "2": "hero_60033"
    },
    "60010": {
      "0": "hero_60001",
      "1": "hero_60002",
      "2": "hero_60006"
    },
    "60011": {
      "0": "hero_60018",
      "1": "hero_60019"
    },
    "60012": {
      "0": "hero_60026",
      "1": "hero_60027",
      "2": "hero_60032",
      "3": "hero_60037",
      "4": "hero_60030"
    },
    "60013": {
      "0": "hero_60035",
      "1": "hero_60036"
    },
    "60014": {
      "0": "hero_60017",
      "1": "hero_60025"
    },
    "60015": {
      "0": "hero_60007",
      "1": "hero_50005",
      "2": "hero_50026"
    },
    "60016": {
      "0": "hero_60011",
      "1": "hero_60012",
      "2": "hero_60013"
    },
    "60017": {
      "0": "hero_60020"
    },
    "60018": {
      "0": "hero_60028"
    },
    "60019": {
      "0": "hero_60031"
    },
    "60020": {
      "0": "hero_60038"
    },
    "60021": {
      "0": "hero_60041",
      "1": "hero_60040"
    },
    "60022": {
      "0": "hero_60004"
    },
};

Database.collects_managed = ((collects) => {
    var managed = {};
    for (var collectId in collects) {
        var heros = collects[collectId];
        for (var pos in heros) {
            var heroName = heros[pos];
            assert(!managed[heroName], "hero '{0}' has more than 2 collects".format(heroName));
            managed[heroName] = {
                collect: Number(collectId),
                pos: Number(pos),
            };
        }
    }
    return managed;
})(Database.collects);

Database.weapons = [
    { "level":1, "cost":1 },
    { "level":2, "cost":2 },
    { "level":4, "cost":3 },
    { "level":6, "cost":4 },
    { "level":8, "cost":5 },
    { "level":10, "cost":10 },
    { "level":20, "cost":20 },
    { "level":30, "cost":30 },
    { "level":40, "cost":40 },
    { "level":50, "cost":60 },
    { "level":60, "cost":80 },
    { "level":70, "cost":100 },
    { "level":80, "cost":120 },
    { "level":90, "cost":200 },
];

Database.weapon_costs = ((weapons) => {
    var last = weapons[weapons.length - 1];
    var costs = { last:last };
    var totalCost = 0;
    var weaponNow = 0;
    var costNow = 0;
    for (var i = 1; i < last.level; ++i) {
        costs[i] = totalCost;
        if (i == weapons[weaponNow].level) {
            costNow = weapons[weaponNow].cost;
            last.total = totalCost;
            weaponNow++;
        }
        totalCost += costNow;
    }
    return costs;
})(Database.weapons);

Database.foods = {
    "food_2":20000,
    "food_3":50000,
    "food_4":100000,
    "food_5":200000,
    "food_6":500000,
};

Database.level_exp = [
    { "level":0, "mul":10000, "base":40000 },
    { "level":120, "mul":15000, "base":1860000 },
    { "level":180, "mul":20000, "base":3680000 },
    { "level":240, "mul":25000, "base":6100000 },
    { "level":300, "mul":30000, "base":9120000 },
    { "level":360, "mul":40000, "base":14560000 },
    { "level":420, "mul":50000, "base":21200000 },
    { "level":480, "mul":60000, "base":29040000 },
    { "level":540, "mul":60000, "base":32640000 },
];

Database.level_coefs = ((level_exp) => {
    var coefs = [];
    var derive = function(level) {
        return this.sqr * level * level + this.mul * level;
    };
    var level_diff_to_exp = function (levelStart, levelEnd) {
        return this.derive(levelEnd) - this.derive(levelStart);
    };
    var exp_to_level_target = function (levelStart, exp) {
        var a = this.sqr;
        var b = this.mul;
        var c = -exp - this.derive(levelStart);
        var delta = b * b - 4 * a * c;
        var rt = (-b + Math.sqrt(delta)) / (2 * a);
        return Math.floor(rt);
    };
    for (var i = 0; i < level_exp.length; ++i) {
        var level_item = level_exp[i];
        var sqr = level_item.mul / 2;
        var mul = level_item.base - level_item.level * level_item.mul - level_item.mul / 2;
        var levelEnd = (level_exp[i+1] ? level_exp[i+1].level : level_item.level + 60);
        var coef = {
            level_start: level_item.level,
            level_end: levelEnd,
            sqr: sqr,
            mul: mul,
            derive: derive,
            level_diff_to_exp: level_diff_to_exp,
            exp_to_level_target: exp_to_level_target,
        };
        coefs.push(coef);
    }
    var first_coef = coefs[0];
    coefs.base_diff = {};
    for (var i = 1; i < 5; ++i) {
        coefs.base_diff[i] = 5000 - first_coef.level_diff_to_exp(i, 5);
    }
    return coefs;
})(Database.level_exp);


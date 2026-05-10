import json
import requests
import re
import os

# --- CONFIGURACIÓN ---
SMOGON_FILE = "./data/gen9championsou-0.json"
OUTPUT_FILE = "./data/data-bundle.json"
GRAPHQL_URL = "https://beta.pokeapi.co/graphql/v1beta"

# 1. PARCHES DE NOMBRES Y FORMAS
POKEAPI_OVERRIDES = {
    "palafin": "palafin-hero", "basculegion": "basculegion-male", "basculegion-f": "basculegion-female",
    "aegislash": "aegislash-shield", "mimikyu": "mimikyu-disguised", "ogerpon-wellspring": "ogerpon-wellspring-mask",
    "ogerpon-hearthflame": "ogerpon-hearthflame-mask", "ogerpon-cornerstone": "ogerpon-cornerstone-mask",
    "urshifu": "urshifu-single-strike", "meowstic": "meowstic-male", "indeedee": "indeedee-male",
    "indeedee-f": "indeedee-female", "tornadus": "tornadus-incarnate", "thundurus": "thundurus-incarnate",
    "landorus": "landorus-incarnate", "enamorus": "enamorus-incarnate", "lycanroc": "lycanroc-midday", 
    "morpeko": "morpeko-full-belly", "gourgeist": "gourgeist-average", "maushold": "maushold-family-of-four", 
    "tauros-paldea-combat": "tauros-paldea-combat-breed", "tauros-paldea-aqua": "tauros-paldea-aqua-breed", 
    "tauros-paldea-blaze": "tauros-paldea-blaze-breed",
}

SHOWDOWN_ALIASES = {
    "aegislash": ["aegislashshield"], "urshifu": ["urshifusinglestrike"], "tornadus": ["tornadusincarnate"],
    "thundurus": ["thundurusincarnate"], "landorus": ["landorusincarnate"], "enamorus": ["enamorusincarnate"],
    "meowstic": ["meowsticmale"], "indeedee": ["indeedeemale"], "basculegion": ["basculegionmale"], "palafin": ["palafinhero"]
}

# MEGAS INVENTADAS (Las que NO existen en PokeAPI)
CUSTOM_CHAMPIONS_DATA = {
    "aegislash-blade": {"types": ["steel", "ghost"], "baseStats": {"hp": 60, "attack": 140, "defense": 50, "special-attack": 140, "special-defense": 50, "speed": 60}},
    "meganium-mega": {"types": ["grass", "fairy"], "baseStats": {"hp": 80, "attack": 82, "defense": 140, "special-attack": 83, "special-defense": 140, "speed": 80}},
    "clefable-mega": {"types": ["fairy"], "baseStats": {"hp": 95, "attack": 70, "defense": 103, "special-attack": 125, "special-defense": 120, "speed": 60}}
}

# 2. MOVIMIENTOS DLC / TEAM STAR / ELIMINADOS
CUSTOM_MOVES_DATA = {
    "tachyoncleave": {"type": "steel", "damageClass": "physical", "power": 50, "hits": 2, "isSpread": False},
    "bloodmoon": {"type": "normal", "damageClass": "special", "power": 140, "hits": 1, "isSpread": False},
    "ivycudgel": {"type": "grass", "damageClass": "physical", "power": 100, "hits": 1, "isSpread": False},
    "surgingstrikes": {"type": "water", "damageClass": "physical", "power": 25, "hits": 3, "isSpread": False},
    "makeitrain": {"type": "steel", "damageClass": "special", "power": 120, "hits": 1, "isSpread": True},
    "ruination": {"type": "dark", "damageClass": "special", "power": 0, "hits": 1, "isSpread": False},
    "terablast": {"type": "normal", "damageClass": "special", "power": 80, "hits": 1, "isSpread": False},
    "kowtowcleave": {"type": "dark", "damageClass": "physical", "power": 85, "hits": 1, "isSpread": False},
    "saltcure": {"type": "rock", "damageClass": "physical", "power": 40, "hits": 1, "isSpread": False},
    "flowertrick": {"type": "grass", "damageClass": "physical", "power": 70, "hits": 1, "isSpread": False},
    "torchsong": {"type": "fire", "damageClass": "special", "power": 80, "hits": 1, "isSpread": False},
    "aquastep": {"type": "water", "damageClass": "physical", "power": 80, "hits": 1, "isSpread": False},
    "gigatonhammer": {"type": "steel", "damageClass": "physical", "power": 160, "hits": 1, "isSpread": False},
    "bittermalice": {"type": "ghost", "damageClass": "special", "power": 75, "hits": 1, "isSpread": False},
    "magicaltorque": {"type": "fairy", "damageClass": "physical", "power": 100, "hits": 1, "isSpread": False},
    "noxioustorque": {"type": "poison", "damageClass": "physical", "power": 100, "hits": 1, "isSpread": False},
    "combattorque": {"type": "fighting", "damageClass": "physical", "power": 100, "hits": 1, "isSpread": False},
    "blazingtorque": {"type": "fire", "damageClass": "physical", "power": 80, "hits": 1, "isSpread": False},
    "wickedtorque": {"type": "dark", "damageClass": "physical", "power": 80, "hits": 1, "isSpread": False},
    "return": {"type": "normal", "damageClass": "physical", "power": 102, "hits": 1, "isSpread": False},
    "frustration": {"type": "normal", "damageClass": "physical", "power": 102, "hits": 1, "isSpread": False},
    "hiddenpower": {"type": "normal", "damageClass": "special", "power": 60, "hits": 1, "isSpread": False}
}

# GENERACIÓN DINÁMICA DE PODER OCULTO PARA TODOS LOS TIPOS
hp_types = ["bug", "dark", "dragon", "electric", "fighting", "fire", "flying", "ghost", "grass", "ground", "ice", "poison", "psychic", "rock", "steel", "water"]
for t in hp_types:
    CUSTOM_MOVES_DATA[f"hiddenpower{t}"] = {"type": t, "damageClass": "special", "power": 60, "hits": 1, "isSpread": False}

# 3. TRADUCCIONES DE EMERGENCIA MASIVAS
CUSTOM_TRANSLATIONS = {
    # Movimientos
    "move:surgingstrikes": "Azote Torrencial", "move:makeitrain": "Fiebre Dorada", "move:ivycudgel": "Garrote Liana",
    "move:ruination": "Ruina", "move:terablast": "Teraexplosión", "move:bloodmoon": "Luna Sangrina",
    "move:tachyoncleave": "Tajo Taquión", "move:kowtowcleave": "Genuflexión Tajo", "move:saltcure": "Salazón",
    "move:flowertrick": "Truco Floral", "move:torchsong": "Canto Ardiente", "move:aquastep": "Danza Acuática",
    "move:gigatonhammer": "Martillo Gigatón", "move:bittermalice": "Rencor Reprimido",
    "move:magicaltorque": "Pique Mágico", "move:noxioustorque": "Pique Nocivo", "move:combattorque": "Pique Marcial",
    "move:blazingtorque": "Pique Ígneo", "move:wickedtorque": "Pique Maligno",
    "move:return": "Retribución", "move:frustration": "Frustración", "move:hiddenpower": "Poder Oculto",
    # Habilidades
    "ability:orichalcumpulse": "Latido Oricalco", "ability:hadronengine": "Motor Hadrónico", 
    "ability:swordofruin": "Espada Debacle", "ability:beadsofruin": "Abalorios Debacle", 
    "ability:vesselofruin": "Caldero Debacle", "ability:tabletsofruin": "Tablilla Debacle", 
    "ability:protosynthesis": "Paleosíntesis", "ability:quarkdrive": "Carga Cuark", "ability:goodasgold": "Cuerpo Áureo",
    # Objetos y Bayas Competitivas
    "item:boosterenergy": "Energía Potenciadora", "item:loadeddice": "Dado Trucado",
    "item:clearamulet": "Amuleto Puro", "item:covertcloak": "Capa Furtiva", "item:punchingglove": "Guante de Boxeo",
    "item:sitrusberry": "Baya Zidra", "item:lumberry": "Baya Ziuela", "item:rawstberry": "Baya Safre",
    "item:chestoberry": "Baya Atania", "item:pechaberry": "Baya Meloc", "item:aspearberry": "Baya Perla", 
    "item:persimberry": "Baya Caqui", "item:salacberry": "Baya Aslac", "item:liechiberry": "Baya Lichi", 
    "item:petayaberry": "Baya Yapati", "item:yacheberry": "Baya Rimoya", "item:chopleberry": "Baya Pom",
    "item:shucaberry": "Baya Acardo", "item:occaberry": "Baya Caoca", "item:passhoberry": "Baya Pasio",
    "item:wacanberry": "Baya Gualot", "item:rindoberry": "Baya Tamar", "item:cobaberry": "Baya Kouba",
    "item:payapberry": "Baya Payapa", "item:tangaberry": "Baya Yecana", "item:chartiberry": "Baya Alcho",
    "item:kasibberry": "Baya Drasi", "item:habanberry": "Baya Anjiro", "item:colburberry": "Baya Dillo",
    "item:babiriberry": "Baya Baribá", "item:roseliberry": "Baya Hibis", "item:chilanberry": "Baya Pomelo"
}
for t in hp_types: CUSTOM_TRANSLATIONS[f"move:hiddenpower{t}"] = "Poder Oculto"

# 4. DESCRIPCIONES DE EMERGENCIA
CUSTOM_DESCRIPTIONS = {
    "move:saltcure": "Inflige daño cada turno al objetivo. Los tipos Acero y Agua reciben más daño.",
    "move:makeitrain": "Reduce el Ataque Especial del usuario. Lluvia de monedas tras el combate.",
    "move:kowtowcleave": "Ataque que nunca falla, ejecutado tras una reverencia.",
    "move:surgingstrikes": "Asesta tres potentes golpes de agua. Siempre resultan en ataques críticos.",
    "move:terablast": "Si el usuario está Teracristalizado, ataca con su Teratipo.",
    "move:bittermalice": "Ataca con un rencor helado que puede reducir el Ataque del objetivo.",
    "move:magicaltorque": "Embestida mágica con el Autostar que puede confundir al rival.",
    "move:return": "Cuanto más apegado esté el Pokémon a su Entrenador, mayor será el poder del ataque.",
    "move:frustration": "Cuanto menos apegado esté el Pokémon a su Entrenador, mayor será el poder.",
    "move:hiddenpower": "El tipo del ataque varía en función de los IVs del Pokémon.",
    "ability:goodasgold": "Cuerpo de oro puro que lo protege de todos los movimientos de estado enemigos.",
    "ability:swordofruin": "El poder de la espada imbuida de odio reduce la Defensa de los demás Pokémon.",
    "item:clearamulet": "Amuleto que impide que las habilidades o movimientos de los rivales bajen las características del portador.",
    "item:covertcloak": "Capa que protege al portador de los efectos secundarios de los movimientos enemigos.",
    "item:boosterenergy": "Cápsula que activa Paleosíntesis o Carga Cuark de inmediato.",
    "item:sitrusberry": "Restaura algunos PS si la salud del portador baja a la mitad o menos.",
    "item:lumberry": "Cura cualquier problema de estado del portador.",
    "item:rawstberry": "Cura las quemaduras del portador."
}
for t in hp_types: CUSTOM_DESCRIPTIONS[f"move:hiddenpower{t}"] = "El tipo del ataque varía en función de los IVs del Pokémon."

# 5. FILTRO DE OBJETOS ACTUALIZADO
VALID_ITEM_CATEGORIES = {
    "held-items", "choice", "bad-held-items", "effort-training", 
    "training", "plates", "species-specific", "type-enhancement", 
    "mega-stones", "z-crystals", "jewels", "in-a-pinch", 
    "picky-healing", "type-protection", "evolution",
    "healing", "status-cures"
}

def clean_desc(text):
    if not text: return ""
    return text.replace('\f', ' ').replace('\n', ' ').replace('  ', ' ').strip()

def normalize_slug(name):
    slug = str(name).lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
    return POKEAPI_OVERRIDES.get(slug, slug)

def to_showdown_id(name):
    return re.sub(r'[^a-z0-9]', '', str(name).lower())

def fetch_graphql(query, variables=None, name="Datos"):
    print(f"-> Descargando {name} de PokeAPI (GraphQL)...")
    payload = {'query': query}
    if variables: payload['variables'] = variables
    encoded_data = json.dumps(payload).encode('utf-8')
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    response = requests.post(GRAPHQL_URL, data=encoded_data, headers=headers)
    if response.status_code != 200: raise Exception(f"Error HTTP {response.status_code}")
    json_data = response.json()
    if 'errors' in json_data: raise Exception(f"Errores en {name}")
    return json_data['data']

def main():
    if not os.path.exists(SMOGON_FILE): return
    print("Leyendo estadísticas de Smogon y registrando inventario...")
    with open(SMOGON_FILE, 'r', encoding='utf-8') as f: raw_smogon = json.load(f)
    
    clean_smogon = {"info": raw_smogon.get("info", {}), "data": {}}
    p2s_species, p2s_moves, p2s_abilities, p2s_items = {}, {}, {}, {}
    smogon_moves, smogon_abilities, smogon_items = set(), set(), set()

    for species, data in raw_smogon.get('data', {}).items():
        s_id = to_showdown_id(species)
        p_slug = normalize_slug(species)
        p2s_species[p_slug] = s_id
        clean_smogon["data"][s_id] = {
            "Raw count": data.get("Raw count", 0),
            "Spreads": data.get("Spreads", {}),
            "Teammates": data.get("Teammates", {})
        }
        for cat, target_dict, p2s_map, tracker in [('Moves', "Moves", p2s_moves, smogon_moves), ('Abilities', "Abilities", p2s_abilities, smogon_abilities), ('Items', "Items", p2s_items, smogon_items)]:
            clean_smogon["data"][s_id][target_dict] = {}
            for k, v in data.get(cat, {}).items():
                if k != "nothing":
                    clean_k = to_showdown_id(k)
                    clean_smogon["data"][s_id][target_dict][clean_k] = v
                    p2s_map[normalize_slug(k)] = clean_k
                    tracker.add(clean_k)

    q_pokemon = "query GetPokemon($list: [String!]) { pokemon: pokemon_v2_pokemon(where: {name: {_in: $list}}) { id name pokemon_v2_pokemonstats { base_stat pokemon_v2_stat { name } } pokemon_v2_pokemontypes { pokemon_v2_type { name } } pokemon_v2_pokemonspecy { pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 7}}) { name } } } }"
    
    q_everything = """
    query GetEverything {
      moves: pokemon_v2_move(limit: 5000) { name power pokemon_v2_type { name } pokemon_v2_movedamageclass { name } pokemon_v2_movemeta { min_hits max_hits } pokemon_v2_movetarget { name } pokemon_v2_movenames(where: {language_id: {_eq: 7}}) { name } pokemon_v2_moveflavortexts(where: {language_id: {_eq: 7}}, order_by: {version_group_id: desc}, limit: 1) { flavor_text } }
      abilities: pokemon_v2_ability(limit: 5000) { name pokemon_v2_abilitynames(where: {language_id: {_eq: 7}}) { name } pokemon_v2_abilityflavortexts(where: {language_id: {_eq: 7}}, order_by: {version_group_id: desc}, limit: 1) { flavor_text } }
      items: pokemon_v2_item(limit: 5000) { name pokemon_v2_itemcategory { name } pokemon_v2_itemnames(where: {language_id: {_eq: 7}}) { name } pokemon_v2_itemflavortexts(where: {language_id: {_eq: 7}}, order_by: {version_group_id: desc}, limit: 1) { flavor_text } }
    }
    """

    species_list = list(p2s_species.keys())
    all_pokemon_data = []
    print("\nDescargando Pokémon en lotes...")
    for i in range(0, len(species_list), 50):
        all_pokemon_data.extend(fetch_graphql(q_pokemon, {"list": species_list[i:i+50]}, f"Pokémon (Lote {i//50 + 1})")['pokemon'])

    data_everything = fetch_graphql(q_everything, None, "Megapetición Global")

    db = {"smogon": clean_smogon, "pokedex": {}, "moves": {}, "abilities": {}, "items": {}, "translations": {}}

    # 1. Procesar Pokémon (Recuperado el Fallback de REST para Megas)
    found_species = set()
    for p in all_pokemon_data:
        p_slug = p['name']
        s_id = p2s_species.get(p_slug, to_showdown_id(p_slug))
        found_species.add(p_slug)
        display_name = p['pokemon_v2_pokemonspecy']['pokemon_v2_pokemonspeciesnames'][0]['name'] if p.get('pokemon_v2_pokemonspecy') and p['pokemon_v2_pokemonspecy'].get('pokemon_v2_pokemonspeciesnames') else p_slug.capitalize()
        stats = {s['pokemon_v2_stat']['name']: s['base_stat'] for s in p['pokemon_v2_pokemonstats']}
        types = [t['pokemon_v2_type']['name'] for t in p['pokemon_v2_pokemontypes']]
        db['pokedex'][s_id] = {"id": p['id'], "name": s_id, "displayName": display_name, "sprite": f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/{p['id']}.png", "types": types, "baseStats": stats}

    # 🚨 LA PIEZA CLAVE QUE SE HABÍA PERDIDO (Recurre a REST para Dragonite-Mega y demás) 🚨
    missing_slugs = set(p2s_species.keys()) - found_species
    if missing_slugs:
        print(f"\n🚨 Recurriendo a endpoints individuales REST API para {len(missing_slugs)} Pokémon (Megas)...")
    for p_slug in missing_slugs:
        s_id = p2s_species[p_slug]
        try:
            resp = requests.get(f"https://pokeapi.co/api/v2/pokemon/{p_slug}")
            if resp.status_code == 200:
                p_data = resp.json()
                types = [t['type']['name'] for t in p_data.get('types', [])]
                stats = {s['stat']['name']: s['base_stat'] for s in p_data.get('stats', [])}
                sprites = p_data.get('sprites', {})
                sprite = sprites.get('other', {}).get('home', {}).get('front_default') or sprites.get('front_default') or ""
                db['pokedex'][s_id] = {"id": p_data.get('id', 0), "name": s_id, "displayName": p_slug.replace('-', ' ').title(), "sprite": sprite, "types": types, "baseStats": stats}
            else:
                db['pokedex'][s_id] = {"id": 0, "name": s_id, "displayName": p_slug.title(), "sprite": "", "types": ["normal"], "baseStats": {"hp": 100, "attack": 100, "defense": 100, "special-attack": 100, "special-defense": 100, "speed": 100}}
        except: pass

    # Inyección de Megas "Inventadas" (Aegislash-Blade, Meganium...)
    for custom_slug, custom_data in CUSTOM_CHAMPIONS_DATA.items():
        c_id = to_showdown_id(custom_slug)
        db['pokedex'][c_id] = {"id": 0, "name": c_id, "displayName": custom_slug.replace('-', ' ').title(), "sprite": "", "types": custom_data["types"], "baseStats": custom_data["baseStats"]}

    for base_id, aliases in SHOWDOWN_ALIASES.items():
        if base_id in db['pokedex']:
            for alias in aliases: db['pokedex'][alias] = db['pokedex'][base_id]

    # 2. PROCESAR MOVIMIENTOS
    for m in data_everything.get('moves', []):
        s_id = to_showdown_id(m['name'])
        target = m['pokemon_v2_movetarget']['name'] if m.get('pokemon_v2_movetarget') else ''
        meta = m['pokemon_v2_movemeta'][0] if m.get('pokemon_v2_movemeta') else {}
        db['moves'][s_id] = {
            "type": m['pokemon_v2_type']['name'] if m.get('pokemon_v2_type') else 'normal',
            "damageClass": m['pokemon_v2_movedamageclass']['name'] if m.get('pokemon_v2_movedamageclass') else 'status',
            "power": m['power'] or 0, "hits": meta.get('min_hits', 1) or 1, "isSpread": target in ['all-opponents', 'all-other-pokemon', 'all-pokemon'],
            "desc": clean_desc(m['pokemon_v2_moveflavortexts'][0]['flavor_text']) if m.get('pokemon_v2_moveflavortexts') else ""
        }
        if m.get('pokemon_v2_movenames'): db['translations'][f"move:{s_id}"] = m['pokemon_v2_movenames'][0]['name']

    # 3. PROCESAR HABILIDADES
    for a in data_everything.get('abilities', []):
        s_id = to_showdown_id(a['name'])
        db['abilities'][s_id] = {"desc": clean_desc(a['pokemon_v2_abilityflavortexts'][0]['flavor_text']) if a.get('pokemon_v2_abilityflavortexts') else ""}
        if a.get('pokemon_v2_abilitynames'): db['translations'][f"ability:{s_id}"] = a['pokemon_v2_abilitynames'][0]['name']

    # 4. PROCESAR OBJETOS (Con las Bayas aseguradas)
    for i in data_everything.get('items', []):
        s_id = to_showdown_id(i['name'])
        category = i['pokemon_v2_itemcategory']['name'] if i.get('pokemon_v2_itemcategory') else ""
        if category in VALID_ITEM_CATEGORIES or s_id in smogon_items:
            db['items'][s_id] = {"desc": clean_desc(i['pokemon_v2_itemflavortexts'][0]['flavor_text']) if i.get('pokemon_v2_itemflavortexts') else ""}
            if i.get('pokemon_v2_itemnames'): db['translations'][f"item:{s_id}"] = i['pokemon_v2_itemnames'][0]['name']

    # 5. INYECTAR PARCHES CUSTOM
    print("\nAplicando parches custom...")
    for s_id, move_data in CUSTOM_MOVES_DATA.items():
        if s_id not in db['moves']: db['moves'][s_id] = move_data
        else: db['moves'][s_id].update(move_data)
    
    # Inyección vital de traducciones EXACTAS
    for key, translation in CUSTOM_TRANSLATIONS.items():
        db['translations'][key] = translation
    
    for key, d in CUSTOM_DESCRIPTIONS.items():
        cat, s_id = key.split(':')
        target_dict = db.get(cat + 's')
        if target_dict is not None:
            if s_id not in target_dict:
                if cat == 'move': target_dict[s_id] = {"type": "normal", "damageClass": "status", "power": 0, "hits": 1, "isSpread": False}
                else: target_dict[s_id] = {}
            target_dict[s_id]['desc'] = d

    # 6. MALLA ANTI-CRASHEOS
    print("\nAuditando fallos de cobertura... Generando fallbacks dinámicos...")
    for s_id in smogon_moves:
        if s_id not in db['moves']:
            db['moves'][s_id] = {"type": "normal", "damageClass": "physical", "power": 0, "hits": 1, "isSpread": False, "desc": "Efecto desconocido."}
            db['translations'][f"move:{s_id}"] = s_id.title()
    for s_id in smogon_abilities:
        if s_id not in db['abilities']:
            db['abilities'][s_id] = {"desc": "Habilidad desconocida."}
            db['translations'][f"ability:{s_id}"] = s_id.title()
    for s_id in smogon_items:
        if s_id not in db['items']:
            db['items'][s_id] = {"desc": "Objeto desconocido."}
            db['translations'][f"item:{s_id}"] = s_id.title()

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(db, f, separators=(',', ':'))
    
    print(f"\n✅ ¡Éxito absoluto! Base de datos blindada y generada en '{OUTPUT_FILE}'.")

if __name__ == "__main__":
    main()
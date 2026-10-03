-- Who each row evolves from, so the server knows the evolution line instead
-- of the client guessing from family_id + dex order.
--
-- evolves_from_id points at the exact parent ROW, not a species: Galarian
-- Linoone -> Galarian Zigzagoon, Obstagoon -> Galarian Linoone, Alolan Raichu
-- -> Pikachu. NULL = first stage. Edited per row on the Game Manager page.
--
-- Backfill below: species links are PokeAPI's
-- pokemon_species.evolves_from_species_id (data, not art). Each child row is
-- matched to a parent row of that species with the same regional prefix
-- (Alolan/Galarian/Hisuian/Paldean), else the plain lowest form. Species that
-- only evolve from a regional form are listed in regional_only. Only NULLs are
-- filled, so re-running never overwrites a mod's correction.

ALTER TABLE public.pokemon_master
  ADD COLUMN IF NOT EXISTS evolves_from_id integer
  REFERENCES public.pokemon_master(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pokemon_master.evolves_from_id IS
  'pokemon_master.id of the row this one evolves from (NULL = first stage). Edited on the Game Manager.';

WITH species(dex, parent) AS (VALUES
  (2,1), (3,2), (5,4), (6,5), (8,7), (9,8), (11,10), (12,11),
  (14,13), (15,14), (17,16), (18,17), (20,19), (22,21), (24,23), (25,172),
  (26,25), (28,27), (30,29), (31,30), (33,32), (34,33), (35,173), (36,35),
  (38,37), (39,174), (40,39), (42,41), (44,43), (45,44), (47,46), (49,48),
  (51,50), (53,52), (55,54), (57,56), (59,58), (61,60), (62,61), (64,63),
  (65,64), (67,66), (68,67), (70,69), (71,70), (73,72), (75,74), (76,75),
  (78,77), (80,79), (82,81), (85,84), (87,86), (89,88), (91,90), (93,92),
  (94,93), (97,96), (99,98), (101,100), (103,102), (105,104), (106,236), (107,236),
  (110,109), (112,111), (113,440), (117,116), (119,118), (121,120), (122,439), (124,238),
  (125,239), (126,240), (130,129), (134,133), (135,133), (136,133), (139,138), (141,140),
  (143,446), (148,147), (149,148), (153,152), (154,153), (156,155), (157,156), (159,158),
  (160,159), (162,161), (164,163), (166,165), (168,167), (169,42), (171,170), (176,175),
  (178,177), (180,179), (181,180), (182,44), (183,298), (184,183), (185,438), (186,61),
  (188,187), (189,188), (192,191), (195,194), (196,133), (197,133), (199,79), (202,360),
  (205,204), (208,95), (210,209), (212,123), (217,216), (219,218), (221,220), (224,223),
  (226,458), (229,228), (230,117), (232,231), (233,137), (237,236), (242,113), (247,246),
  (248,247), (253,252), (254,253), (256,255), (257,256), (259,258), (260,259), (262,261),
  (264,263), (266,265), (267,266), (268,265), (269,268), (271,270), (272,271), (274,273),
  (275,274), (277,276), (279,278), (281,280), (282,281), (284,283), (286,285), (288,287),
  (289,288), (291,290), (292,290), (294,293), (295,294), (297,296), (301,300), (305,304),
  (306,305), (308,307), (310,309), (315,406), (317,316), (319,318), (321,320), (323,322),
  (326,325), (329,328), (330,329), (332,331), (334,333), (340,339), (342,341), (344,343),
  (346,345), (348,347), (350,349), (354,353), (356,355), (358,433), (362,361), (364,363),
  (365,364), (367,366), (368,366), (372,371), (373,372), (375,374), (376,375), (388,387),
  (389,388), (391,390), (392,391), (394,393), (395,394), (397,396), (398,397), (400,399),
  (402,401), (404,403), (405,404), (407,315), (409,408), (411,410), (413,412), (414,412),
  (416,415), (419,418), (421,420), (423,422), (424,190), (426,425), (428,427), (429,200),
  (430,198), (432,431), (435,434), (437,436), (444,443), (445,444), (448,447), (450,449),
  (452,451), (454,453), (457,456), (460,459), (461,215), (462,82), (463,108), (464,112),
  (465,114), (466,125), (467,126), (468,176), (469,193), (470,133), (471,133), (472,207),
  (473,221), (474,233), (475,281), (476,299), (477,356), (478,361), (496,495), (497,496),
  (499,498), (500,499), (502,501), (503,502), (505,504), (507,506), (508,507), (510,509),
  (512,511), (514,513), (516,515), (518,517), (520,519), (521,520), (523,522), (525,524),
  (526,525), (528,527), (530,529), (533,532), (534,533), (536,535), (537,536), (541,540),
  (542,541), (544,543), (545,544), (547,546), (549,548), (552,551), (553,552), (555,554),
  (558,557), (560,559), (563,562), (565,564), (567,566), (569,568), (571,570), (573,572),
  (575,574), (576,575), (578,577), (579,578), (581,580), (583,582), (584,583), (586,585),
  (589,588), (591,590), (593,592), (596,595), (598,597), (600,599), (601,600), (603,602),
  (604,603), (606,605), (608,607), (609,608), (611,610), (612,611), (614,613), (617,616),
  (620,619), (623,622), (625,624), (628,627), (630,629), (634,633), (635,634), (637,636),
  (651,650), (652,651), (654,653), (655,654), (657,656), (658,657), (660,659), (662,661),
  (663,662), (665,664), (666,665), (668,667), (670,669), (671,670), (673,672), (675,674),
  (678,677), (680,679), (681,680), (683,682), (685,684), (687,686), (689,688), (691,690),
  (693,692), (695,694), (697,696), (699,698), (700,133), (705,704), (706,705), (709,708),
  (711,710), (713,712), (715,714), (723,722), (724,723), (726,725), (727,726), (729,728),
  (730,729), (732,731), (733,732), (735,734), (737,736), (738,737), (740,739), (743,742),
  (745,744), (748,747), (750,749), (752,751), (754,753), (756,755), (758,757), (760,759),
  (762,761), (763,762), (768,767), (770,769), (773,772), (783,782), (784,783), (790,789),
  (791,790), (792,790), (804,803), (809,808), (811,810), (812,811), (814,813), (815,814),
  (817,816), (818,817), (820,819), (822,821), (823,822), (825,824), (826,825), (828,827),
  (830,829), (832,831), (834,833), (836,835), (838,837), (839,838), (841,840), (842,840),
  (844,843), (847,846), (849,848), (851,850), (853,852), (855,854), (857,856), (858,857),
  (860,859), (861,860), (862,264), (863,52), (864,222), (865,83), (866,122), (867,562),
  (869,868), (873,872), (879,878), (886,885), (887,886), (892,891), (899,234), (900,123),
  (901,217), (902,550), (903,215), (904,211), (907,906), (908,907), (910,909), (911,910),
  (913,912), (914,913), (916,915), (918,917), (920,919), (922,921), (923,922), (925,924),
  (927,926), (929,928), (930,929), (933,932), (934,933), (936,935), (937,935), (939,938),
  (941,940), (943,942), (945,944), (947,946), (949,948), (952,951), (954,953), (956,955),
  (958,957), (959,958), (961,960), (964,963), (966,965), (970,969), (972,971), (975,974),
  (979,57), (980,194), (981,203), (982,206), (983,625), (997,996), (998,997), (1000,999),
  (1011,840), (1013,1012), (1018,884), (1019,1011)
),
regional_only(dex, region) AS (VALUES
  (862,'Galarian'), (863,'Galarian'), (864,'Galarian'), (865,'Galarian'),
  (866,'Galarian'), (867,'Galarian'), (903,'Hisuian'), (904,'Hisuian'),
  (980,'Paldean')
),
child AS (
  SELECT c.id, s.parent,
         COALESCE(ro.region, substring(c.name FROM '^(Alolan|Galarian|Hisuian|Paldean) ')) AS region
  FROM public.pokemon_master c
  JOIN species s ON s.dex = c.national_dex_id
  LEFT JOIN regional_only ro ON ro.dex = c.national_dex_id
  WHERE c.evolves_from_id IS NULL
)
UPDATE public.pokemon_master pm
SET evolves_from_id = (
  SELECT p.id FROM public.pokemon_master p
  WHERE p.national_dex_id = child.parent
  ORDER BY (child.region IS NOT NULL AND p.name LIKE child.region || ' %') DESC,
           (p.name ~ '^(Alolan|Galarian|Hisuian|Paldean) ') ASC,
           p.form_id ASC
  LIMIT 1
)
FROM child
WHERE pm.id = child.id;

-- Per-Pokémon exceptions to Restricted rules: ids of rules that do NOT apply
-- to this row. Ids are games.js restricted_checklist ids (usum_no_uwr,
-- lza_no_hyperspace, ...) plus 'no_eggs' for the all-games egg rule. Edited on
-- the Game Manager (Exceptions column). Replaces exemptions that were
-- hardcoded in client/src/constants/huntPrep.js.
ALTER TABLE public.pokemon_master
  ADD COLUMN IF NOT EXISTS rule_exemptions text[] NOT NULL DEFAULT '{}'::text[];

-- Carry over the hardcoded exemptions (About page exceptions).
UPDATE public.pokemon_master SET rule_exemptions = array_append(rule_exemptions, 'no_eggs')
  WHERE (national_dex_id = 489 OR national_dex_id BETWEEN 906 AND 914)
    AND NOT ('no_eggs' = ANY(rule_exemptions));
UPDATE public.pokemon_master SET rule_exemptions = array_append(rule_exemptions, 'usum_no_uwr')
  WHERE (legendary OR ultra_beast)
    AND NOT ('usum_no_uwr' = ANY(rule_exemptions));
UPDATE public.pokemon_master SET rule_exemptions = array_append(rule_exemptions, 'lza_no_hyperspace')
  WHERE national_dex_id IN (999, 1000)
    AND NOT ('lza_no_hyperspace' = ANY(rule_exemptions));

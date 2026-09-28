# シンプルな絵（ピクトグラム）SVGを生成する。Robse自作素材。
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'assets', 'pict')
os.makedirs(OUT, exist_ok=True)
S = '#33475b'
B, O, G, Y, P, N, W = '#9cc8e8', '#f5b98a', '#a6d8b0', '#f6d97a', '#f3b0bd', '#d8dde3', '#ffffff'
st = f'stroke="{S}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"'

def hand(x, y, s=1.0, fill=O):
    # ミトン形の手（手のひら正面）。x,y は手のひら左上
    def r(a): return a * s
    parts = []
    for i in range(4):
        fx = x + r(2 + i * 9)
        parts.append(f'<rect x="{fx:.1f}" y="{y - r(22 - abs(1.5 - i) * 4):.1f}" width="{r(8.5):.1f}" height="{r(30):.1f}" rx="{r(4.2):.1f}" fill="{fill}" {st}/>')
    parts.append(f'<rect x="{x - r(9):.1f}" y="{y + r(6):.1f}" width="{r(8.5):.1f}" height="{r(22):.1f}" rx="{r(4.2):.1f}" fill="{fill}" {st} transform="rotate(-35 {x - r(5):.1f} {y + r(17):.1f})"/>')
    parts.append(f'<rect x="{x}" y="{y}" width="{r(38):.1f}" height="{r(34):.1f}" rx="{r(11):.1f}" fill="{fill}" {st}/>')
    return ''.join(parts)

P_ = {}
P_['play'] = f'''<circle cx="34" cy="62" r="20" fill="{O}" {st}/><path d="M16 56 Q34 66 52 56 M34 42 Q28 62 34 82" fill="none" {st}/>
<rect x="58" y="58" width="26" height="26" rx="3" fill="{B}" {st}/><rect x="61" y="32" width="20" height="26" rx="3" fill="{G}" {st}/><path d="M71 18 L82 32 L60 32 Z" fill="{Y}" {st}/>'''
P_['handwash'] = f'''<path d="M22 20 H58 V30 H48 V38 H38 V30 H22 Z" fill="{N}" {st}/><rect x="16" y="16" width="8" height="18" rx="3" fill="{N}" {st}/>
<path d="M43 44 V52 M39 58 v6 M47 58 v6" fill="none" stroke="{B}" stroke-width="4" stroke-linecap="round"/>
<path d="M12 64 H88 Q86 88 62 90 H38 Q14 88 12 64 Z" fill="{W}" {st}/>
<circle cx="66" cy="54" r="6" fill="{W}" {st}/><circle cx="78" cy="46" r="4.5" fill="{W}" {st}/><circle cx="74" cy="34" r="3.5" fill="{W}" {st}/>
<path d="M30 74 Q50 80 70 74" fill="none" stroke="{B}" stroke-width="4" stroke-linecap="round"/>'''
P_['snack'] = f'''<circle cx="38" cy="58" r="24" fill="{Y}" {st}/><circle cx="30" cy="50" r="3" fill="{S}"/><circle cx="44" cy="46" r="3" fill="{S}"/><circle cx="46" cy="64" r="3" fill="{S}"/><circle cx="31" cy="67" r="3" fill="{S}"/>
<path d="M62 40 H88 L84 84 H66 Z" fill="{W}" {st}/><path d="M64 56 H86" fill="none" {st}/><path d="M65 58 H85 L83 82 H67 Z" fill="{B}" stroke="none"/>'''
P_['tidy'] = f'''<path d="M14 50 H86 L80 88 H20 Z" fill="{O}" {st}/><path d="M14 50 L24 40 H76 L86 50" fill="none" {st}/>
<circle cx="36" cy="30" r="10" fill="{B}" {st}/><rect x="54" y="18" width="18" height="18" rx="3" fill="{G}" {st}/>
<path d="M50 56 V78 M42 70 L50 78 L58 70" fill="none" {st}/>'''
P_['gohome'] = f'''<path d="M14 48 L50 16 L86 48" fill="none" {st}/><path d="M22 42 V86 H78 V42" fill="{Y}" {st}/>
<rect x="42" y="58" width="16" height="28" rx="2" fill="{O}" {st}/><rect x="28" y="52" width="10" height="10" fill="{B}" {st}/><rect x="62" y="52" width="10" height="10" fill="{B}" {st}/>'''
P_['study'] = f'''<rect x="18" y="16" width="52" height="70" rx="4" fill="{W}" {st}/><path d="M28 32 H60 M28 44 H60 M28 56 H60 M28 68 H48" fill="none" stroke="{N}" stroke-width="3.5" stroke-linecap="round"/>
<rect x="18" y="16" width="10" height="70" rx="3" fill="{B}" {st}/>
<g transform="rotate(35 70 58)"><rect x="64" y="22" width="12" height="56" rx="2" fill="{Y}" {st}/><path d="M64 78 L70 92 L76 78 Z" fill="{O}" {st}/></g>'''
P_['book'] = f'''<path d="M50 28 Q34 18 12 22 V80 Q34 76 50 86 Q66 76 88 80 V22 Q66 18 50 28 Z" fill="{W}" {st}/><path d="M50 28 V86" fill="none" {st}/>
<path d="M20 36 Q32 34 42 38 M20 48 Q32 46 42 50 M58 38 Q68 34 80 36 M58 50 Q68 46 80 48" fill="none" stroke="{B}" stroke-width="3.5" stroke-linecap="round"/>'''
P_['rest'] = f'''<path d="M12 56 Q12 44 24 44 H76 Q88 44 88 56 V76 H12 Z" fill="{B}" {st}/><rect x="22" y="34" width="56" height="24" rx="8" fill="{B}" {st}/><path d="M20 76 V86 M80 76 V86" fill="none" {st}/>
<rect x="24" y="52" width="52" height="12" rx="4" fill="{W}" {st}/>
<text x="60" y="26" font-family="sans-serif" font-size="16" font-weight="700" fill="{S}">z</text><text x="72" y="16" font-family="sans-serif" font-size="12" font-weight="700" fill="{S}">z</text>'''
P_['exercise'] = f'''<path d="M14 70 Q14 54 26 50 L40 46 Q46 34 58 34 L64 36 Q66 56 86 62 Q90 64 90 70 V76 H14 Z" fill="{G}" {st}/><path d="M14 76 H90 V82 Q90 86 86 86 H18 Q14 86 14 82 Z" fill="{W}" {st}/>
<path d="M44 50 L52 56 M50 44 L58 50" fill="none" {st}/>'''
P_['meal'] = f'''<path d="M14 48 H86 Q84 80 58 84 H42 Q16 80 14 48 Z" fill="{W}" {st}/><path d="M40 84 V90 H60 V84" fill="{W}" {st}/>
<path d="M20 48 Q24 34 36 36 Q42 26 52 30 Q62 24 68 34 Q80 34 80 48 Z" fill="{W}" {st}/><path d="M24 62 Q50 70 76 62" fill="none" stroke="{P}" stroke-width="4" stroke-linecap="round"/>
<path d="M60 14 L88 40 M70 10 L92 34" fill="none" stroke="{O}" stroke-width="5" stroke-linecap="round"/>'''
P_['toothbrush'] = f'''<g transform="rotate(-35 50 50)"><rect x="10" y="44" width="62" height="10" rx="5" fill="{B}" {st}/><rect x="66" y="36" width="24" height="12" rx="2" fill="{W}" {st}/><path d="M70 36 V30 M76 36 V30 M82 36 V30 M88 36 V30" fill="none" {st}/></g>
<path d="M58 62 Q58 52 68 52 Q74 56 80 52 Q90 52 90 62 Q90 72 86 80 L84 90 Q80 92 78 86 L76 78 Q74 74 72 78 L70 86 Q68 92 64 90 L62 80 Q58 72 58 62 Z" fill="{W}" {st}/>'''
P_['clothes'] = f'''<path d="M36 14 Q50 24 64 14 L88 26 L80 44 L70 40 V88 H30 V40 L20 44 L12 26 Z" fill="{B}" {st}/><path d="M36 14 Q50 30 64 14" fill="none" {st}/>'''
P_['toilet'] = f'''<rect x="22" y="12" width="36" height="26" rx="4" fill="{W}" {st}/><path d="M16 44 H82 Q82 66 60 70 L62 88 H34 L36 70 Q16 64 16 44 Z" fill="{W}" {st}/>
<rect x="14" y="38" width="70" height="8" rx="4" fill="{B}" {st}/><path d="M50 22 H54" fill="none" {st}/>'''
P_['sit'] = f'''<rect x="28" y="14" width="40" height="36" rx="5" fill="{O}" {st}/><rect x="20" y="50" width="60" height="12" rx="4" fill="{O}" {st}/><path d="M28 62 V90 M72 62 V90 M28 76 H72" fill="none" {st}/>'''
P_['outside'] = f'''<circle cx="26" cy="26" r="11" fill="{Y}" {st}/><path d="M26 6 V10 M26 42 V46 M6 26 H10 M42 26 H46 M12 12 L15 15 M37 37 L40 40 M40 12 L37 15 M12 40 L15 37" fill="none" {st}/>
<path d="M66 90 V62" fill="none" stroke="{S}" stroke-width="6" stroke-linecap="round"/><circle cx="66" cy="44" r="22" fill="{G}" {st}/><path d="M8 90 H92" fill="none" {st}/>'''
P_['draw'] = f'''<rect x="12" y="20" width="60" height="64" rx="3" fill="{W}" {st}/><path d="M22 70 L34 50 L44 62 L52 50 L62 70 Z" fill="{G}" {st}/><circle cx="54" cy="34" r="6" fill="{Y}" {st}/>
<g transform="rotate(30 78 56)"><rect x="72" y="26" width="12" height="50" rx="2" fill="{P}" {st}/><path d="M72 76 L78 90 L84 76 Z" fill="{W}" {st}/></g>'''
P_['car'] = f'''<path d="M10 66 V54 Q10 48 16 47 L28 44 L38 28 Q40 24 46 24 H66 Q72 24 74 30 L80 44 Q90 46 90 54 V66 Z" fill="{B}" {st}/>
<path d="M42 30 H54 V44 H34 Z M60 30 H68 L74 44 H60 Z" fill="{W}" {st}/><circle cx="30" cy="68" r="9" fill="{N}" {st}/><circle cx="72" cy="68" r="9" fill="{N}" {st}/><path d="M8 84 H92" fill="none" {st}/>'''
P_['finish'] = f'''<path d="M24 90 V12" fill="none" stroke="{S}" stroke-width="5" stroke-linecap="round"/><rect x="24" y="14" width="56" height="40" fill="{W}" {st}/>
<path d="M24 14 h14 v10 h-14 z M52 14 h14 v10 h-14 z M38 24 h14 v10 h-14 z M66 24 h14 v10 h-14 z M24 34 h14 v10 h-14 z M52 34 h14 v10 h-14 z M38 44 h14 v10 h-14 z M66 44 h14 v10 h-14 z" fill="{S}"/>'''
P_['help'] = f'''<rect x="28" y="22" width="44" height="36" rx="4" fill="{O}" {st}/><path d="M28 36 H72 M50 22 V36" fill="none" {st}/>
<path d="M4 62 H40 Q48 62 48 70 Q48 78 40 78 H4 Z" fill="{Y}" {st}/><rect x="30" y="52" width="9" height="16" rx="4.5" fill="{Y}" {st}/>
<path d="M96 62 H60 Q52 62 52 70 Q52 78 60 78 H96 Z" fill="{Y}" {st}/><rect x="61" y="52" width="9" height="16" rx="4.5" fill="{Y}" {st}/>'''
P_['no'] = hand(34, 40, 0.95, O) + f'''<path d="M70 16 L90 36 M90 16 L70 36" fill="none" stroke="{S}" stroke-width="6" stroke-linecap="round"/>'''
P_['again'] = f'''<path d="M78 50 A28 28 0 1 1 64 26" fill="none" stroke="{S}" stroke-width="8" stroke-linecap="round"/><path d="M56 12 L76 22 L60 38 Z" fill="{S}" stroke="{S}" stroke-width="3" stroke-linejoin="round"/>
<text x="50" y="62" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="{S}">1</text>'''
P_['water'] = f'''<path d="M26 30 H74 L68 88 H32 Z" fill="{W}" {st}/><path d="M29 48 H71 L68 86 H32 Z" fill="{B}" stroke="none"/><path d="M26 30 H74 L68 88 H32 Z" fill="none" {st}/>
<path d="M50 6 Q60 18 60 23 A10 10 0 0 1 40 23 Q40 18 50 6 Z" fill="{B}" {st}/>'''
P_['wait'] = f'''<path d="M26 12 H74 M26 88 H74" fill="none" stroke="{S}" stroke-width="6" stroke-linecap="round"/><path d="M30 14 Q30 40 50 50 Q70 40 70 14 Z M30 86 Q30 60 50 50 Q70 60 70 86 Z" fill="{W}" {st}/>
<path d="M36 84 Q40 70 50 66 Q60 70 64 84 Z" fill="{Y}" stroke="none"/><path d="M40 26 H60 L50 40 Z" fill="{Y}" stroke="none"/>'''
P_['trouble'] = f'''<path d="M16 16 H84 Q90 16 90 22 V64 Q90 70 84 70 H44 L26 86 V70 H16 Q10 70 10 64 V22 Q10 16 16 16 Z" fill="{W}" {st}/>
<text x="50" y="58" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="{S}">?</text>'''
P_['thanks'] = f'''<path d="M50 84 Q14 62 14 38 Q14 20 32 20 Q44 20 50 32 Q56 20 68 20 Q86 20 86 38 Q86 62 50 84 Z" fill="{P}" {st}/>'''
P_['wantend'] = f'''<rect x="20" y="10" width="44" height="80" rx="2" fill="{O}" {st}/><circle cx="54" cy="52" r="3.5" fill="{S}"/>
<path d="M60 50 H90 M80 40 L90 50 L80 60" fill="none" stroke="{S}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'''
P_['quiet'] = f'''<path d="M20 60 V48 A30 30 0 0 1 80 48 V60" fill="none" stroke="{S}" stroke-width="6" stroke-linecap="round"/>
<rect x="10" y="54" width="20" height="32" rx="7" fill="{B}" {st}/><rect x="70" y="54" width="20" height="32" rx="7" fill="{B}" {st}/>'''
P_['raise'] = hand(32, 44, 1.0, O) + f'''<rect x="40" y="76" width="22" height="18" fill="{O}" {st}/>'''

for k, body in P_.items():
    with open(os.path.join(OUT, k + '.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{body}</svg>\n')
print(len(P_), 'files')

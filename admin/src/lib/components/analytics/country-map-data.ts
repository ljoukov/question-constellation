// Country reference points from the world-countries ISO dataset.
// Coordinates are intentionally country-level reference points, never city or IP locations.

export type CountryReference = {
	code: string;
	alpha3: string;
	name: string;
	longitude: number;
	latitude: number;
};

const COUNTRY_REFERENCE_DATA = `AD|AND|Andorra|1.5|42.5
AE|ARE|United Arab Emirates|54|24
AF|AFG|Afghanistan|65|33
AG|ATG|Antigua and Barbuda|-61.8|17.05
AI|AIA|Anguilla|-63.16666666|18.25
AL|ALB|Albania|20|41
AM|ARM|Armenia|45|40
AO|AGO|Angola|18.5|-12.5
AQ|ATA|Antarctica|0|-90
AR|ARG|Argentina|-64|-34
AS|ASM|American Samoa|-170|-14.33333333
AT|AUT|Austria|13.33333333|47.33333333
AU|AUS|Australia|133|-27
AW|ABW|Aruba|-69.96666666|12.5
AX|ALA|Åland Islands|19.9|60.116667
AZ|AZE|Azerbaijan|47.5|40.5
BA|BIH|Bosnia and Herzegovina|18|44
BB|BRB|Barbados|-59.53333333|13.16666666
BD|BGD|Bangladesh|90|24
BE|BEL|Belgium|4|50.83333333
BF|BFA|Burkina Faso|-2|13
BG|BGR|Bulgaria|25|43
BH|BHR|Bahrain|50.55|26
BI|BDI|Burundi|30|-3.5
BJ|BEN|Benin|2.25|9.5
BL|BLM|Saint Barthélemy|-63.41666666|18.5
BM|BMU|Bermuda|-64.75|32.33333333
BN|BRN|Brunei|114.66666666|4.5
BO|BOL|Bolivia|-65|-17
BQ|BES|Caribbean Netherlands|-68.25|12.18
BR|BRA|Brazil|-55|-10
BS|BHS|Bahamas|-76|24.25
BT|BTN|Bhutan|90.5|27.5
BV|BVT|Bouvet Island|3.4|-54.43333333
BW|BWA|Botswana|24|-22
BY|BLR|Belarus|28|53
BZ|BLZ|Belize|-88.75|17.25
CA|CAN|Canada|-95|60
CC|CCK|Cocos (Keeling) Islands|96.83333333|-12.5
CD|COD|DR Congo|25|0
CF|CAF|Central African Republic|21|7
CG|COG|Republic of the Congo|15|-1
CH|CHE|Switzerland|8|47
CI|CIV|Ivory Coast|-5|8
CK|COK|Cook Islands|-159.76666666|-21.23333333
CL|CHL|Chile|-71|-30
CM|CMR|Cameroon|12|6
CN|CHN|China|105|35
CO|COL|Colombia|-72|4
CR|CRI|Costa Rica|-84|10
CU|CUB|Cuba|-80|21.5
CV|CPV|Cape Verde|-24|16
CW|CUW|Curaçao|-68.933333|12.116667
CX|CXR|Christmas Island|105.66666666|-10.5
CY|CYP|Cyprus|33|35
CZ|CZE|Czechia|15.5|49.75
DE|DEU|Germany|9|51
DJ|DJI|Djibouti|43|11.5
DK|DNK|Denmark|10|56
DM|DMA|Dominica|-61.33333333|15.41666666
DO|DOM|Dominican Republic|-70.66666666|19
DZ|DZA|Algeria|3|28
EC|ECU|Ecuador|-77.5|-2
EE|EST|Estonia|26|59
EG|EGY|Egypt|30|27
EH|ESH|Western Sahara|-13|24.5
ER|ERI|Eritrea|39|15
ES|ESP|Spain|-4|40
ET|ETH|Ethiopia|38|8
FI|FIN|Finland|26|64
FJ|FJI|Fiji|175|-18
FK|FLK|Falkland Islands|-59|-51.75
FM|FSM|Micronesia|158.25|6.91666666
FO|FRO|Faroe Islands|-7|62
FR|FRA|France|2|46
GA|GAB|Gabon|11.75|-1
GB|GBR|United Kingdom|-2|54
GD|GRD|Grenada|-61.66666666|12.11666666
GE|GEO|Georgia|43.5|42
GF|GUF|French Guiana|-53|4
GG|GGY|Guernsey|-2.58333333|49.46666666
GH|GHA|Ghana|-2|8
GI|GIB|Gibraltar|-5.35|36.13333333
GL|GRL|Greenland|-40|72
GM|GMB|Gambia|-16.56666666|13.46666666
GN|GIN|Guinea|-10|11
GP|GLP|Guadeloupe|-61.583333|16.25
GQ|GNQ|Equatorial Guinea|10|2
GR|GRC|Greece|22|39
GS|SGS|South Georgia|-37|-54.5
GT|GTM|Guatemala|-90.25|15.5
GU|GUM|Guam|144.78333333|13.46666666
GW|GNB|Guinea-Bissau|-15|12
GY|GUY|Guyana|-59|5
HK|HKG|Hong Kong|114.188|22.267
HM|HMD|Heard Island and McDonald Islands|72.51666666|-53.1
HN|HND|Honduras|-86.5|15
HR|HRV|Croatia|15.5|45.16666666
HT|HTI|Haiti|-72.41666666|19
HU|HUN|Hungary|20|47
ID|IDN|Indonesia|120|-5
IE|IRL|Ireland|-8|53
IL|ISR|Israel|35.13|31.47
IM|IMN|Isle of Man|-4.5|54.25
IN|IND|India|77|20
IO|IOT|British Indian Ocean Territory|71.5|-6
IQ|IRQ|Iraq|44|33
IR|IRN|Iran|53|32
IS|ISL|Iceland|-18|65
IT|ITA|Italy|12.83333333|42.83333333
JE|JEY|Jersey|-2.16666666|49.25
JM|JAM|Jamaica|-77.5|18.25
JO|JOR|Jordan|36|31
JP|JPN|Japan|138|36
KE|KEN|Kenya|38|1
KG|KGZ|Kyrgyzstan|75|41
KH|KHM|Cambodia|105|13
KI|KIR|Kiribati|173|1.41666666
KM|COM|Comoros|44.25|-12.16666666
KN|KNA|Saint Kitts and Nevis|-62.75|17.33333333
KP|PRK|North Korea|127|40
KR|KOR|South Korea|127.5|37
KW|KWT|Kuwait|45.75|29.5
KY|CYM|Cayman Islands|-80.5|19.5
KZ|KAZ|Kazakhstan|68|48
LA|LAO|Laos|105|18
LB|LBN|Lebanon|35.83333333|33.83333333
LC|LCA|Saint Lucia|-60.96666666|13.88333333
LI|LIE|Liechtenstein|9.53333333|47.26666666
LK|LKA|Sri Lanka|81|7
LR|LBR|Liberia|-9.5|6.5
LS|LSO|Lesotho|28.5|-29.5
LT|LTU|Lithuania|24|56
LU|LUX|Luxembourg|6.16666666|49.75
LV|LVA|Latvia|25|57
LY|LBY|Libya|17|25
MA|MAR|Morocco|-5|32
MC|MCO|Monaco|7.4|43.73333333
MD|MDA|Moldova|29|47
ME|MNE|Montenegro|19.3|42.5
MF|MAF|Saint Martin|-63.95|18.08333333
MG|MDG|Madagascar|47|-20
MH|MHL|Marshall Islands|168|9
MK|MKD|North Macedonia|22|41.83333333
ML|MLI|Mali|-4|17
MM|MMR|Myanmar|98|22
MN|MNG|Mongolia|105|46
MO|MAC|Macau|113.55|22.16666666
MP|MNP|Northern Mariana Islands|145.75|15.2
MQ|MTQ|Martinique|-61|14.666667
MR|MRT|Mauritania|-12|20
MS|MSR|Montserrat|-62.2|16.75
MT|MLT|Malta|14.58333333|35.83333333
MU|MUS|Mauritius|57.55|-20.28333333
MV|MDV|Maldives|73|3.25
MW|MWI|Malawi|34|-13.5
MX|MEX|Mexico|-102|23
MY|MYS|Malaysia|112.5|2.5
MZ|MOZ|Mozambique|35|-18.25
NA|NAM|Namibia|17|-22
NC|NCL|New Caledonia|165.5|-21.5
NE|NER|Niger|8|16
NF|NFK|Norfolk Island|167.95|-29.03333333
NG|NGA|Nigeria|8|10
NI|NIC|Nicaragua|-85|13
NL|NLD|Netherlands|5.75|52.5
NO|NOR|Norway|10|62
NP|NPL|Nepal|84|28
NR|NRU|Nauru|166.91666666|-0.53333333
NU|NIU|Niue|-169.86666666|-19.03333333
NZ|NZL|New Zealand|174|-41
OM|OMN|Oman|57|21
PA|PAN|Panama|-80|9
PE|PER|Peru|-76|-10
PF|PYF|French Polynesia|-140|-15
PG|PNG|Papua New Guinea|147|-6
PH|PHL|Philippines|122|13
PK|PAK|Pakistan|70|30
PL|POL|Poland|20|52
PM|SPM|Saint Pierre and Miquelon|-56.33333333|46.83333333
PN|PCN|Pitcairn Islands|-130.1|-25.06666666
PR|PRI|Puerto Rico|-66.5|18.25
PS|PSE|Palestine|35.2|31.9
PT|PRT|Portugal|-8|39.5
PW|PLW|Palau|134.5|7.5
PY|PRY|Paraguay|-58|-23
QA|QAT|Qatar|51.25|25.5
RE|REU|Réunion|55.5|-21.15
RO|ROU|Romania|25|46
RS|SRB|Serbia|21|44
RU|RUS|Russia|100|60
RW|RWA|Rwanda|30|-2
SA|SAU|Saudi Arabia|45|25
SB|SLB|Solomon Islands|159|-8
SC|SYC|Seychelles|55.66666666|-4.58333333
SD|SDN|Sudan|30|15
SE|SWE|Sweden|15|62
SG|SGP|Singapore|103.8|1.36666666
SH|SHN|Saint Helena, Ascension and Tristan da Cunha|-5.72|-15.95
SI|SVN|Slovenia|14.81666666|46.11666666
SJ|SJM|Svalbard and Jan Mayen|20|78
SK|SVK|Slovakia|19.5|48.66666666
SL|SLE|Sierra Leone|-11.5|8.5
SM|SMR|San Marino|12.41666666|43.76666666
SN|SEN|Senegal|-14|14
SO|SOM|Somalia|49|10
SR|SUR|Suriname|-56|4
SS|SSD|South Sudan|30|7
ST|STP|São Tomé and Príncipe|7|1
SV|SLV|El Salvador|-88.91666666|13.83333333
SX|SXM|Sint Maarten|-63.05|18.033333
SY|SYR|Syria|38|35
SZ|SWZ|Eswatini|31.5|-26.5
TC|TCA|Turks and Caicos Islands|-71.58333333|21.75
TD|TCD|Chad|19|15
TF|ATF|French Southern and Antarctic Lands|69.167|-49.25
TG|TGO|Togo|1.16666666|8
TH|THA|Thailand|100|15
TJ|TJK|Tajikistan|71|39
TK|TKL|Tokelau|-172|-9
TL|TLS|Timor-Leste|125.91666666|-8.83333333
TM|TKM|Turkmenistan|60|40
TN|TUN|Tunisia|9|34
TO|TON|Tonga|-175|-20
TR|TUR|Türkiye|35|39
TT|TTO|Trinidad and Tobago|-61|11
TV|TUV|Tuvalu|178|-8
TW|TWN|Taiwan|121|23.5
TZ|TZA|Tanzania|35|-6
UA|UKR|Ukraine|32|49
UG|UGA|Uganda|32|1
UM|UMI|United States Minor Outlying Islands|166.633333|19.3
US|USA|United States|-97|38
UY|URY|Uruguay|-56|-33
UZ|UZB|Uzbekistan|64|41
VA|VAT|Vatican City|12.45|41.9
VC|VCT|Saint Vincent and the Grenadines|-61.2|13.25
VE|VEN|Venezuela|-66|8
VG|VGB|British Virgin Islands|-64.62305|18.431383
VI|VIR|United States Virgin Islands|-64.933333|18.35
VN|VNM|Vietnam|107.83333333|16.16666666
VU|VUT|Vanuatu|167|-16
WF|WLF|Wallis and Futuna|-176.2|-13.3
WS|WSM|Samoa|-172.33333333|-13.58333333
XK|UNK|Kosovo|21.166667|42.666667
YE|YEM|Yemen|48|15
YT|MYT|Mayotte|45.16666666|-12.83333333
ZA|ZAF|South Africa|24|-29
ZM|ZMB|Zambia|30|-15
ZW|ZWE|Zimbabwe|30|-20`;

export const COUNTRY_REFERENCES: readonly CountryReference[] = COUNTRY_REFERENCE_DATA.split(
	'\n'
).map((line) => {
	const [code, alpha3, name, longitude, latitude] = line.split('|');
	return {
		code,
		alpha3,
		name,
		longitude: Number(longitude),
		latitude: Number(latitude)
	};
});

"""Generates woms-schema.yaml and woms-schema.sql from section 9.6 (built entities) of
WOMS-functional-spec.md plus the proposed entities defined below (section 9.7).
Run:  python3 generate.py   (from this directory)"""
import re, pathlib
HERE = pathlib.Path(__file__).parent
spec = (HERE.parent / 'WOMS-functional-spec.md').read_text()
sec = spec[spec.index('### 9.6 '):spec.index('### 9.7 ')]

def parse_type(t):
    t = t.strip()
    m = re.match(r'reference → (\w+)', t)
    if m: return ('ref', m.group(1))
    m = re.match(r'string\((\d+)\)', t)
    if m: return ('string', int(m.group(1)))
    m = re.match(r'decimal\((\d+) places\)', t)
    if m: return ('decimal', int(m.group(1)))
    return (t, None)

entities = {}
for block in re.split(r'^#### ', sec, flags=re.M)[1:]:
    name = re.match(r'`(\w+)`', block).group(1)
    fields = []
    for row in re.findall(r'^\| `(\w+)` \|(.*)\|$', block, flags=re.M):
        fname, rest = row
        cells = [c.strip() for c in rest.split('|')]
        typ, arg = parse_type(cells[0])
        notes = cells[3] if len(cells) > 3 else ''
        f = dict(name=fname, type=typ, arg=arg, required=cells[1] == 'yes', unique=cells[2] == 'yes', notes=notes)
        if typ == 'ref':
            f['on_delete'] = 'cascade' if 'cascade' in notes else ('set_null' if 'set null' in notes else 'restrict')
        d = re.search(r'default `([^`]*)`', notes)
        if d: f['default'] = d.group(1)
        fields.append(f)
    entities[name] = dict(status='built', fields=fields)

# ---- proposed entities (spec section 9.7); (name, type, required, notes)
def P(*rows): return [dict(name=n, type=t if not t.startswith('ref:') else 'ref', arg=(t[4:] if t.startswith('ref:') else None),
                           required=r, unique=False, notes=no,
                           **({'on_delete': 'cascade' if 'cascade' in no else 'restrict'} if t.startswith('ref:') else {})) for n, t, r, no in rows]
proposed = {
 'RateCard': P(('name','string',True,''),('customer_id','ref:Customers',False,'empty = default card'),('warehouse_id','ref:Warehouses',False,'empty = all'),
   ('currency','string',True,'ISO 4217'),('effective_from','date',True,''),('effective_to','date',False,'no overlap per customer+warehouse'),('status','string',True,'Draft|Active|Retired'),('notes','text',False,'')),
 'RateCardLine': P(('rate_card_id','ref:RateCard',True,'cascade delete'),('charge_type','string',True,'STORAGE|DOCK_STORAGE|RECEIVING|HU_LABEL|PUTAWAY|PICK|DISPATCH|RELOCATION|VAL_<service>|SURCHARGE_*|FIXED_FEE|MINIMUM_CHARGE'),
   ('basis','string',True,'PER_UNIT_DAY|PER_HU_DAY|PER_M3_DAY|PER_M2_DAY|PER_KG_DAY|PER_EVENT|PER_HU|PER_HOUR|FLAT_PERIOD'),('unit_price','decimal',True,'4 places'),
   ('capacity_unit','string',False,''),('package_type_id','ref:PackageTypes',False,''),('zone_type','string',False,''),('zone_id','ref:Zones',False,''),('service_type','string',False,''),
   ('condition','string',False,'predicate e.g. adr = Yes'),('free_days','integer',False,''),('min_days','integer',False,''),('min_charge','decimal',False,'2 places'),('zoho_item','string',False,''),('priority','integer',False,'lowest wins')),
 'BillingSettings': P(('warehouse_id','ref:Warehouses',False,'empty = global'),('cutoff_time','string',True,'default 23:59'),('day_rule','string',True,'snapshot|any_presence|24h_blocks'),('dock_free_hours','integer',False,'default 24'),
   ('billing_period','string',True,'monthly|weekly'),('invoice_grouping','string',False,''),('payment_terms_days','integer',False,''),('rounding_mode','string',False,''),('approval_required','boolean',False,''),
   ('approval_threshold','decimal',False,''),('invoice_mode','string',False,'draft|send'),('time_zone','string',True,'')),
 'OccupancyDay': P(('date','date',True,'unique with cargo_id'),('warehouse_id','ref:Warehouses',True,''),('customer_id','ref:Customers',True,''),('cargo_id','ref:Cargo',True,''),('inbound_advice_id','ref:InboundAdvice',False,''),
   ('location_id','ref:StorageLocations',False,''),('zone_id','ref:Zones',False,''),('hu_status','string',False,''),('capacity_unit','string',False,''),('units','decimal',False,''),('weight_kg','decimal',False,''),
   ('volume_m3','decimal',False,''),('day_number','integer',False,''),('billable','boolean',True,''),('free_reason','string',False,''),('invoice_line_id','ref:InvoiceLine',False,'set when locked')),
 'ChargeEvent': P(('occurred_at','datetime',True,''),('warehouse_id','ref:Warehouses',True,''),('customer_id','ref:Customers',True,''),('charge_type','string',True,''),('quantity','decimal',True,''),
   ('source_module','string',True,''),('source_record','string',True,''),('unit_price','decimal',False,''),('amount','decimal',False,''),('status','string',True,'Open|Disputed|Waived|Invoiced'),
   ('dispute_reason','text',False,''),('invoice_line_id','ref:InvoiceLine',False,'')),
 'InvoiceRun': P(('period_from','date',True,''),('period_to','date',True,''),('scope','text',False,'customers/warehouses'),('status','string',True,'Draft|In review|Approved|Pushed|Partially failed'),('created_by','string',True,'')),
 'InvoiceProposal': P(('invoice_run_id','ref:InvoiceRun',True,'cascade delete'),('customer_id','ref:Customers',True,''),('warehouse_id','ref:Warehouses',False,''),('currency','string',True,''),('subtotal','decimal',True,''),
   ('status','string',True,'Draft|Approved|Pushed|Failed|Void'),('approved_by','string',False,''),('approved_at','datetime',False,''),('statement_file','string',False,''),('zoho_invoice_id','string',False,''),
   ('zoho_invoice_number','string',False,''),('zoho_status','string',False,'draft|sent|viewed|unpaid|overdue|partially_paid|paid|void'),('zoho_url','string',False,''),('pushed_at','datetime',False,''),('error_message','text',False,'')),
 'InvoiceLine': P(('invoice_proposal_id','ref:InvoiceProposal',True,'cascade delete'),('charge_type','string',True,''),('description','text',False,''),('quantity','decimal',True,''),('unit','string',False,''),
   ('unit_price','decimal',True,''),('amount','decimal',True,''),('zoho_item_id','string',False,''),('tax_code','string',False,''),('source','string',False,'occupancy|event|adjustment'),('period_from','date',False,''),('period_to','date',False,'')),
 'ZohoBooksConnection': P(('data_center','string',True,''),('organization_id','string',True,''),('client_id','string',True,''),('encrypted_secrets','text',True,'server-side only, never returned'),('scopes','text',False,''),
   ('status','string',True,'Connected|Needs re-authorisation|Error'),('connected_by','string',False,''),('connected_at','datetime',False,''),('last_sync_at','datetime',False,''),('invoice_mode','string',False,'')),
 'ZohoCustomerMap': P(('customer_id','ref:Customers',True,'cascade delete'),('zoho_contact_id','string',True,''),('sync_status','string',False,''),('last_synced','datetime',False,'')),
 'ZohoItemMap': P(('charge_type','string',True,''),('zone_id','ref:Zones',False,''),('service_type','string',False,''),('zoho_item_id','string',True,''),('zoho_tax_id','string',False,''),('name_snapshot','string',False,'')),
 'IntegrationLog': P(('occurred_at','datetime',True,''),('direction','string',True,'out|in'),('entity','string',True,''),('record_id','string',False,''),('idempotency_key','string',False,''),
   ('http_status','integer',False,''),('zoho_code','string',False,''),('message','text',False,''),('retry_count','integer',False,''),('status','string',True,'')),
 'Receipt': P(('inbound_advice_id','ref:InboundAdvice',True,'cascade delete'),('receipt_number','string',True,''),('arrived_at','datetime',True,''),('plate','string',False,''),('driver','string',False,''),
   ('counted_pieces','integer',False,''),('condition_notes','text',False,''),('signature_document_id','ref:Documents',False,''),('grn_id','ref:GRN',False,'')),
 'VerificationPolicy': P(('warehouse_id','ref:Warehouses',True,'cascade delete'),('activity_type','string',True,''),('required','boolean',True,''),('verifier_role','string',False,''),('verifier_must_differ','boolean',False,'')),
 'Notification': P(('user_id','ref:AppUsers',True,'cascade delete'),('event_type','string',True,''),('title','string',True,''),('body','text',False,''),('record_link','string',False,''),('channel','string',False,''),('read_at','datetime',False,''),('delivery_status','string',False,'')),
 'PushSubscription': P(('user_id','ref:AppUsers',True,'cascade delete'),('endpoint','text',True,''),('keys','text',True,''),('device_label','string',False,'')),
 'Setting': P(('key','string',True,'unique'),('value','text',False,'')),
 'CountSession': P(('warehouse_id','ref:Warehouses',True,''),('location_id','ref:StorageLocations',False,''),('status','string',True,''),('started_by','string',False,''),('started_at','datetime',False,'')),
 'CountLine': P(('count_session_id','ref:CountSession',True,'cascade delete'),('cargo_id','ref:Cargo',False,''),('expected','boolean',True,''),('found','boolean',True,''),('resolution','string',False,'')),
}
for k, v in proposed.items(): entities[k] = dict(status='proposed', fields=v)

# ---------------- YAML ----------------
def q(s): return '"' + str(s).replace('\\','\\\\').replace('"','\\"') + '"'
y = ['# WOMS schema, generated by generate.py from WOMS-functional-spec.md (sections 9.6 and 9.7).',
     '# Every entity also has: id (opaque string primary key), created_at, updated_at, created_by.',
     '# status: built = exists in the reference application; proposed = specified only (billing, mobile, planned features).',
     'entities:']
for name, e in entities.items():
    y += [f'  {name}:', f'    status: {e["status"]}', '    fields:']
    for f in e['fields']:
        parts = [f'type: {f["type"]}']
        if f.get('arg') is not None: parts.append(('references' if f['type']=='ref' else 'size') + f': {f["arg"]}')
        if f['required']: parts.append('required: true')
        if f['unique']: parts.append('unique: true')
        if f.get('on_delete'): parts.append(f'on_delete: {f["on_delete"]}')
        if f.get('default'): parts.append(f'default: {q(f["default"])}')
        if f['notes']: parts.append(f'notes: {q(f["notes"])}')
        y.append(f'      {f["name"]}: {{ ' + ', '.join(parts) + ' }')
(HERE / 'woms-schema.yaml').write_text('\n'.join(y) + '\n')

# ---------------- SQL (PostgreSQL) ----------------
def snake(n):
    n = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', n)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', n).lower()
sql = ['-- WOMS schema (PostgreSQL), generated by generate.py. Review before use: ids are text keys, add indexes for your queries.',
       '-- Tables are created without foreign keys first; constraints are added at the end so order does not matter.', '']
fks = []
for name, e in entities.items():
    t = snake(name)
    cols = ['  id text primary key', '  created_at timestamptz not null default now()', '  updated_at timestamptz not null default now()', '  created_by text']
    for f in e['fields']:
        if f['name'] in ('id',): continue
        typ = {'string': f'varchar({f["arg"]})' if f.get('arg') else 'text', 'text':'text','integer':'integer','boolean':'boolean','date':'date',
               'datetime':'timestamptz','decimal': f'numeric(18,{f["arg"] or 4})','ref':'text'}.get(f['type'], 'text')
        c = f'  {f["name"]} {typ}'
        if f['required']: c += ' not null'
        if f['unique']: c += ' unique'
        if f.get('default'): c += f" default '{f['default']}'"
        cols.append(c)
        if f['type'] == 'ref':
            od = {'cascade': 'cascade', 'set_null': 'set null', 'restrict': 'restrict'}[f['on_delete']]
            fks.append(f'alter table {t} add foreign key ({f["name"]}) references {snake(f["arg"])}(id) on delete {od};')
    sql += [f'create table {t} ( -- {e["status"]}', ',\n'.join(cols), ');', '']
sql += fks
(HERE / 'woms-schema.sql').write_text('\n'.join(sql) + '\n')
print(len(entities), 'entities;', sum(1 for e in entities.values() if e['status']=='built'), 'built;', len(fks), 'foreign keys')

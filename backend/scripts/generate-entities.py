"""One-off codegen used to produce the initial draft of all 77 TypeORM
entities in src/database/entities/ from the live, Prisma-migrated
database (Phase 2 of the Prisma -> TypeORM migration — see
docs/features/typeorm-migration-phase-0.md for the entity-authoring
conventions this encodes, e.g. @Index({unique:true}) never @Unique(),
explicit foreignKeyConstraintName/primaryKeyConstraintName matching
Prisma's naming, literal (not raw-SQL-function) defaults on enum columns).

Not meant to be re-run as-is: it reads from /tmp/full_metadata.json, a
one-time dump of information_schema/pg_catalog metadata (columns, PKs,
FKs, indexes) plus a parse of prisma/schema.prisma for model->table
names and @relation field metadata, assembled via ad-hoc psql queries
during that phase. Kept here as a reference for later phases (7 more
tables' worth of PII/relation nuance can come up) and to be deleted
once Prisma is fully removed (Phase 14), not as a repeatable tool.
"""

import json, re, os

data = json.load(open('/tmp/full_metadata.json'))
model_table = data['model_table']
relations = data['relations']
columns = data['columns']
array_elem = data['array_elem']
pks = data['pks']
fks = data['fks']
indexes = data['indexes']
enum_names = set(l.strip() for l in open('/tmp/enum_names.txt'))

OUT_DIR = '/home/user/blujet2/backend/src/database/entities'

def kebab(name):
    s = re.sub(r'(?<!^)(?=[A-Z])', '-', name)
    return s.lower()

def parse_default(default_str, col_type_kind, col_name):
    """Returns a python repr string to embed as the `default:` value, or None."""
    if not default_str:
        return None
    if default_str == 'CURRENT_TIMESTAMP':
        return ('raw', "() => 'CURRENT_TIMESTAMP'")
    if default_str == 'true':
        return ('lit', 'true')
    if default_str == 'false':
        return ('lit', 'false')
    m = re.match(r"^'([^']*)'::\"(\w+)\"$", default_str)
    if m:
        val, enum_type = m.groups()
        return ('enum', f'{enum_type}.{val}')
    m = re.match(r"^'([^']*)'::text$", default_str)
    if m:
        val = m.group(1)
        escaped = val.replace("'", "\\'")
        return ('lit', f"'{escaped}'")
    m = re.match(r"^'([^']*)'::jsonb$", default_str)
    if m:
        val = m.group(1)
        if val == '[]':
            return ('lit', '[]')
        return ('raw', f'() => {json.dumps(default_str)}')
    if default_str == 'ARRAY[]::"BookingChannel"[]':
        return ('lit', '[]')
    if default_str == 'ARRAY[]::text[]':
        return ('lit', '[]')
    if re.match(r'^-?\d+$', default_str):
        return ('lit', default_str)
    # fallback: unknown pattern, flag it
    return ('unknown', default_str)

def ts_prop_name(name):
    return name

warnings = []

def map_column(table, col, is_pk):
    name = col['name']
    dtype = col['data_type']
    udt = col['udt_name']
    nullable = col['nullable']
    default = col['default']
    precision = col['precision']

    opts = {}
    ts_type = None
    is_array_col = False
    enum_type_name = None

    if dtype == 'ARRAY':
        key = f"{table}|{name}"
        elem = array_elem.get(key)
        is_array_col = True
        if elem in enum_names:
            enum_type_name = elem
            opts['type'] = "'enum'"
            opts['enum'] = elem
            opts['enumName'] = f"'{elem}'"
            opts['array'] = 'true'
            ts_type = f'{elem}[]'
        else:
            opts['type'] = "'text'"
            opts['array'] = 'true'
            ts_type = 'string[]'
    elif dtype == 'USER-DEFINED':
        enum_type_name = udt
        opts['type'] = "'enum'"
        opts['enum'] = udt
        opts['enumName'] = f"'{udt}'"
        ts_type = udt
    elif dtype == 'text':
        opts['type'] = "'text'"
        ts_type = 'string'
    elif dtype == 'bigint':
        opts['type'] = "'bigint'"
        opts['transformer'] = 'bigintTransformer'
        ts_type = 'bigint'
    elif dtype == 'integer':
        opts['type'] = "'int'"
        ts_type = 'number'
    elif dtype == 'boolean':
        opts['type'] = "'boolean'"
        ts_type = 'boolean'
    elif dtype == 'double precision':
        opts['type'] = "'float'"
        ts_type = 'number'
    elif dtype == 'timestamp without time zone':
        opts['type'] = "'timestamp'"
        opts['precision'] = precision or '3'
        ts_type = 'Date'
    elif dtype == 'jsonb':
        opts['type'] = "'jsonb'"
        ts_type = 'JsonValue'
    else:
        warnings.append(f"UNKNOWN TYPE {table}.{name}: {dtype}")
        opts['type'] = "'text'"
        ts_type = 'unknown'

    if nullable and not is_pk:
        opts['nullable'] = 'true'

    default_parsed = parse_default(default, opts.get('type'), name)
    use_create_date = False
    if default_parsed:
        kind, val = default_parsed
        if kind == 'raw' and val == "() => 'CURRENT_TIMESTAMP'":
            use_create_date = True
            opts['default'] = val
        elif kind == 'unknown':
            warnings.append(f"UNKNOWN DEFAULT {table}.{name}: {val}")
        else:
            opts['default'] = val

    return {
        'name': name, 'opts': opts, 'ts_type': ts_type,
        'nullable': nullable, 'is_array': is_array_col,
        'use_create_date': use_create_date, 'enum_type_name': enum_type_name,
    }

def format_column_decorator(colinfo, is_pk, table):
    opts = colinfo['opts']
    parts = []
    for k in ['type', 'enum', 'enumName', 'array', 'precision', 'nullable', 'default', 'transformer']:
        if k in opts:
            v = opts[k]
            if k in ('enum',):
                parts.append(f"{k}: {v}")
            elif k in ('precision',):
                parts.append(f"{k}: {v}")
            else:
                parts.append(f"{k}: {v}")
    opts_str = ', '.join(parts)
    if is_pk:
        pk_opts = opts_str + f", primaryKeyConstraintName: '{table}_pkey'"
        return f"@PrimaryColumn({{ {pk_opts} }})"
    if colinfo['use_create_date']:
        # remove type since CreateDateColumn implies timestamp; keep precision+default
        filtered = {k: v for k, v in opts.items() if k != 'type'}
        parts2 = [f"{k}: {v}" for k, v in filtered.items()]
        return f"@CreateDateColumn({{ {', '.join(parts2)} }})"
    return f"@Column({{ {opts_str} }})"

def ts_type_str(colinfo):
    t = colinfo['ts_type']
    if colinfo['nullable']:
        return f"{t} | null"
    return t

generated_files = []

for model, table in sorted(model_table.items()):
    cols = columns.get(table, [])
    pk_cols = pks.get(table, [])
    fk_list = fks.get(table, [])
    idx_list = indexes.get(table, [])
    rel_list = relations.get(model, [])

    rel_by_fk_col = {}
    for r in rel_list:
        if r['fk_column']:
            rel_by_fk_col[r['fk_column']] = r

    fk_by_col = {fk['column']: fk for fk in fk_list}

    used_enum_types = set()
    used_relation_targets = set()
    has_bigint = False
    has_jsonb = False

    lines_columns = []
    for col in cols:
        colinfo = map_column(table, col, col['name'] in pk_cols)
        if colinfo['enum_type_name']:
            used_enum_types.add(colinfo['enum_type_name'])
        if 'bigintTransformer' in json.dumps(colinfo['opts']):
            has_bigint = True
        if colinfo['ts_type'] == 'JsonValue':
            has_jsonb = True

        is_pk = col['name'] in pk_cols
        decorator = format_column_decorator(colinfo, is_pk, table)
        ts_type = ts_type_str(colinfo)
        lines_columns.append(f"  {decorator}\n  {col['name']}!: {ts_type};\n")

        # relation for this FK column, if any
        rel = rel_by_fk_col.get(col['name'])
        if rel:
            fk_meta = fk_by_col.get(col['name'])
            target = rel['target']
            used_relation_targets.add(target)
            on_delete = fk_meta['delete_rule'] if fk_meta else 'NO ACTION'
            on_update = fk_meta['update_rule'] if fk_meta else 'CASCADE'
            rel_type = f"{target} | null" if rel['optional'] else target
            fk_constraint_name = fk_meta['constraint_name'] if fk_meta else f"{table}_{col['name']}_fkey"
            lines_columns.append(
                f"  @ManyToOne(() => {target}, {{ onDelete: '{on_delete}', onUpdate: '{on_update}' }})\n"
                f"  @JoinColumn({{ name: '{col['name']}', foreignKeyConstraintName: '{fk_constraint_name}' }})\n"
                f"  {rel['field']}!: {rel_type};\n"
            )

    # class-level indexes
    index_decorators = []
    for idx in idx_list:
        m = re.search(r'USING btree \(([^)]*)\)(\s+WHERE\s+\((.*)\))?$', idx['def'])
        if not m:
            warnings.append(f"UNPARSEABLE INDEX {table}.{idx['name']}: {idx['def']}")
            continue
        col_list_raw = m.group(1)
        where_clause = m.group(3)
        cols_parsed = [c.strip() for c in col_list_raw.split(',')]
        cols_ts = ', '.join(f"'{c.strip(chr(34))}'" for c in cols_parsed)
        opts_parts = []
        if idx['unique']:
            opts_parts.append('unique: true')
        if where_clause:
            where_escaped = where_clause.replace('"', '\\"')
            opts_parts.append(f'where: "{where_escaped}"')
        opts_str = ', {' + ', '.join(opts_parts) + '}' if opts_parts else ''
        index_decorators.append(f"@Index('{idx['name']}', [{cols_ts}]{opts_str})")

    # imports
    typeorm_imports = {'Entity', 'Column', 'PrimaryColumn'}
    if any(c['use_create_date'] for c in [map_column(table, c, c['name'] in pk_cols) for c in cols]):
        typeorm_imports.add('CreateDateColumn')
    if index_decorators:
        typeorm_imports.add('Index')
    if any(rel_by_fk_col.get(c['name']) for c in cols):
        typeorm_imports.add('ManyToOne')
        typeorm_imports.add('JoinColumn')

    import_lines = [f"import {{ {', '.join(sorted(typeorm_imports))} }} from 'typeorm';"]
    if used_enum_types:
        import_lines.append(f"import {{ {', '.join(sorted(used_enum_types))} }} from '../enums';")
    if has_bigint:
        import_lines.append("import { bigintTransformer } from '../transformers/bigint.transformer';")
    if has_jsonb:
        import_lines.append("import type { JsonValue } from '../json-types';")
    for target in sorted(used_relation_targets):
        if target != model:
            import_lines.append(f"import {{ {target} }} from './{kebab(target)}.entity';")

    class_decorators = index_decorators + [f"@Entity('{table}')"]

    content = '\n'.join(import_lines) + '\n\n'
    content += '\n'.join(class_decorators) + '\n'
    content += f"export class {model} {{\n"
    content += '\n'.join(lines_columns)
    content += "}\n"

    fname = f"{kebab(model)}.entity.ts"
    generated_files.append((model, fname))
    with open(os.path.join(OUT_DIR, fname), 'w') as f:
        f.write(content)

print(f"Generated {len(generated_files)} entity files")
print(f"\nWarnings ({len(warnings)}):")
for w in warnings:
    print(" -", w)

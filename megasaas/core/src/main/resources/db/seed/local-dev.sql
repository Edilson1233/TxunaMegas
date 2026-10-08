-- Local development seed for manual testing.
-- This file is intentionally outside db/migration, so Flyway will not run it
-- automatically. Do not apply it to production databases.

begin;

insert into tenants (id, slug, display_name, status)
values (
    '11111111-1111-1111-1111-111111111111',
    'local-dev',
    'Local Dev Reseller',
    'ACTIVE'
)
on conflict (id) do update
set slug = excluded.slug,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now();

insert into whatsapp_instances (id, tenant_id, instance_id, display_name, status)
values (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'default-instance',
    'Local WhatsApp Instance',
    'ACTIVE'
)
on conflict (instance_id) do update
set tenant_id = excluded.tenant_id,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now();

insert into automation_devices (id, tenant_id, name, device_key_hash, status)
values (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Local MacroDroid Device',
    'local-dev-placeholder-not-for-production',
    'ACTIVE'
)
on conflict (id) do update
set tenant_id = excluded.tenant_id,
    name = excluded.name,
    device_key_hash = excluded.device_key_hash,
    status = excluded.status,
    updated_at = now();

insert into products (id, tenant_id, name, description, status)
values (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'Mobile Data',
    'Local development data bundles',
    'ACTIVE'
)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

insert into product_packages (
    id, tenant_id, product_id, name, allowance_mb, validity_days, status
)
values
(
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '600MB',
    600,
    7,
    'ACTIVE'
),
(
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '1200MB',
    1200,
    7,
    'ACTIVE'
)
on conflict (id) do update
set name = excluded.name,
    allowance_mb = excluded.allowance_mb,
    validity_days = excluded.validity_days,
    status = excluded.status,
    updated_at = now();

insert into prices (
    id, tenant_id, package_id, amount, currency, valid_from, valid_to
)
values
(
    '77777777-7777-7777-7777-777777777777',
    '11111111-1111-1111-1111-111111111111',
    '55555555-5555-5555-5555-555555555555',
    15.00,
    'MZN',
    '2026-01-01T00:00:00Z',
    null
),
(
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    '66666666-6666-6666-6666-666666666666',
    30.00,
    'MZN',
    '2026-01-01T00:00:00Z',
    null
)
on conflict (id) do update
set amount = excluded.amount,
    currency = excluded.currency,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to;

commit;

create table tenants (
    id uuid primary key,
    slug varchar(80) not null unique,
    display_name varchar(160) not null,
    status varchar(30) not null check (status in ('ACTIVE', 'SUSPENDED', 'DISABLED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table users (
    id uuid primary key,
    email varchar(320) not null unique,
    password_hash text not null,
    status varchar(30) not null check (status in ('ACTIVE', 'DISABLED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table tenant_memberships (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    user_id uuid not null references users(id),
    role varchar(30) not null check (role in ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER')),
    created_at timestamptz not null default now(),
    unique (tenant_id, user_id)
);

create table whatsapp_instances (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    instance_id varchar(120) not null unique,
    display_name varchar(160),
    status varchar(30) not null check (status in ('ACTIVE', 'DISCONNECTED', 'DISABLED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table automation_devices (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    name varchar(160) not null,
    device_key_hash text not null,
    status varchar(30) not null check (status in ('ACTIVE', 'SUSPENDED', 'DISABLED')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table idempotency_keys (
    id uuid primary key,
    tenant_id uuid references tenants(id),
    idempotency_key varchar(128) not null,
    operation varchar(120) not null,
    request_hash varchar(128),
    response_status integer,
    response_body jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    unique (tenant_id, idempotency_key, operation)
);

create table customers (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    phone_number varchar(32),
    whatsapp_jid varchar(160),
    display_name varchar(160),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, phone_number)
);

create table products (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    name varchar(160) not null,
    description text,
    status varchar(30) not null check (status in ('ACTIVE', 'INACTIVE')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table product_packages (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    product_id uuid not null references products(id),
    name varchar(160) not null,
    allowance_mb integer,
    validity_days integer,
    status varchar(30) not null check (status in ('ACTIVE', 'INACTIVE')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table prices (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    package_id uuid not null references product_packages(id),
    amount numeric(12, 2) not null check (amount >= 0),
    currency char(3) not null default 'MZN',
    valid_from timestamptz not null,
    valid_to timestamptz,
    created_at timestamptz not null default now()
);

create table orders (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    customer_id uuid references customers(id),
    package_id uuid references product_packages(id),
    context_key varchar(320) not null,
    destination_number varchar(32),
    amount_expected numeric(12, 2),
    status varchar(40) not null check (
        status in ('PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'PROCESSING_USSD', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table payments (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    order_id uuid references orders(id),
    provider varchar(30) not null check (provider in ('MPESA', 'EMOLA')),
    external_transaction_id varchar(80) not null,
    transaction_type varchar(40) not null check (transaction_type in ('RECEIVED', 'TRANSFER_SENT', 'UNKNOWN')),
    amount numeric(12, 2),
    fee numeric(12, 2),
    counterparty_phone varchar(32),
    counterparty_name varchar(200),
    destination_number varchar(32),
    balance_after numeric(12, 2),
    occurred_at timestamptz,
    status varchar(30) not null check (status in ('CLAIMED', 'CONFIRMED', 'REJECTED', 'USED', 'ORPHAN', 'EXPIRED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, provider, external_transaction_id)
);

create table payment_claims (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    payment_id uuid references payments(id),
    whatsapp_instance_id uuid not null references whatsapp_instances(id),
    context_key varchar(320) not null,
    chat_type varchar(30) not null check (chat_type in ('PRIVATE', 'GROUP')),
    chat_id varchar(160) not null,
    user_id varchar(160),
    message_id varchar(160) not null,
    raw_message_text text,
    claimed_at timestamptz not null,
    status varchar(30) not null check (status in ('PENDING', 'MATCHED', 'REJECTED', 'EXPIRED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, whatsapp_instance_id, message_id)
);

create table payment_confirmations (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    payment_id uuid references payments(id),
    device_id uuid not null references automation_devices(id),
    external_transaction_id varchar(80) not null,
    raw_sms text not null,
    reported_at timestamptz not null,
    parser_version varchar(40) not null,
    status varchar(30) not null check (status in ('ORPHAN', 'MATCHED', 'REJECTED', 'EXPIRED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, device_id, external_transaction_id)
);

create table ussd_commands (
    id uuid primary key,
    tenant_id uuid not null references tenants(id),
    order_id uuid not null references orders(id),
    payment_id uuid not null references payments(id),
    device_id uuid references automation_devices(id),
    destination_number varchar(32) not null,
    amount numeric(12, 2) not null check (amount >= 0),
    status varchar(30) not null check (status in ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')),
    attempt_count integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    dispatched_at timestamptz,
    acknowledged_at timestamptz,
    updated_at timestamptz not null default now()
);

create table audit_events (
    id uuid primary key,
    tenant_id uuid references tenants(id),
    actor_type varchar(30) not null check (actor_type in ('SYSTEM', 'USER', 'DEVICE', 'CUSTOMER')),
    actor_id varchar(120),
    event_type varchar(120) not null,
    resource_type varchar(120),
    resource_id varchar(120),
    metadata jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null
);

create index idx_whatsapp_instances_tenant_id on whatsapp_instances(tenant_id);
create index idx_automation_devices_tenant_id on automation_devices(tenant_id);
create index idx_idempotency_keys_tenant_operation on idempotency_keys(tenant_id, operation);
create index idx_customers_tenant_id on customers(tenant_id);
create index idx_orders_tenant_status on orders(tenant_id, status);
create index idx_payments_tenant_status on payments(tenant_id, status);
create index idx_payment_claims_tenant_status on payment_claims(tenant_id, status);
create index idx_payment_confirmations_tenant_status on payment_confirmations(tenant_id, status);
create index idx_ussd_commands_tenant_status on ussd_commands(tenant_id, status);
create index idx_audit_events_tenant_occurred_at on audit_events(tenant_id, occurred_at);

create unique index uq_ussd_commands_one_active_per_order_payment
    on ussd_commands(tenant_id, order_id, payment_id)
    where status in ('PENDING', 'DISPATCHED');

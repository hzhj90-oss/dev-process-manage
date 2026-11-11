# Database migrations

- V1.0.0__initial_schema.sql: initial 16-table schema and four environment records.
- Apply migrations in ascending version order.
- Do not edit a migration after it has been applied to a shared database; add a new migration instead.
- Keep passwords, tokens and cookies out of migration files.
- Local database credentials are stored under the ignored .local directory.
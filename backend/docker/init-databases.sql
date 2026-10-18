-- Only creates absent local test databases; never drops existing data.
SELECT 'CREATE DATABASE school_pay_demo_test OWNER kindo'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'school_pay_demo_test')
\gexec
SELECT 'CREATE DATABASE school_pay_demo_migration_test OWNER kindo'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'school_pay_demo_migration_test')
\gexec

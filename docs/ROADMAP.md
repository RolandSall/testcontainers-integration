# Roadmap

## 0.1 extraction

- Standalone Bun and Nx workspace
- Dual ESM and CommonJS packages
- Vitest 4 and Jest 30 container lifecycle adapters
- Concise explicit project configuration plus annotation-based discovery
- Named container instances and declarative application environment bindings
- SQL Server, PostgreSQL, MongoDB, RabbitMQ, and custom images
- Shared networks, dynamic ports, typed resources, logs, and failure cleanup
- Optional data-test core and Prisma adapter
- Compatibility package for the original import name
- Isolated packed-package consumer tests for ESM, CommonJS, Vitest, and Jest
- Docker-backed CI smoke tests for every built-in adapter
- Actionable missing-runner-setup diagnostics
- Aggregated startup and cleanup failure reporting

## Before 1.0

- Optional adapter packages so consumers install only the built-ins they use
- Jest rollback-only data-test adapter after execution wrapping is proven safe
- API Extractor review and documented semantic-versioning policy

## Later

- Additional brokers and cloud emulators based on demand
- ORM adapters contributed as separate packages
- Optional Cucumber lifecycle adapter if direct runtime usage proves repetitive
- Windows and additional container-runtime compatibility lanes

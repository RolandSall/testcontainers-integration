# Custom containers

There are two extension paths.

Use `GenericTestContainer` for an ordinary Docker image. Declare a unique kind in the stable
resource-map module, create a catalog entry, describe ports and environment, and map the started
handle to a serializable resource. Use a dedicated class implementing `Container<TResource>`
when the image needs complex readiness, files, commands, or cleanup.

For two instances of the same technology, give each instance a distinct kind such as
`postgres-primary` and `postgres-replica`. Register one factory for each and require both kinds.
They receive distinct stable network aliases and distinct random host ports.

Never return the native started container through `ContainerResources`. Vitest and Jest worker
transfer requires plain serializable data. Never log passwords or complete authenticated URLs.

The [container package guide](../packages/testcontainers-integration/README.md) contains a typed
module augmentation and registration example.

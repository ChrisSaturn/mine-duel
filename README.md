# mine-duel

## Architecture Docs

- [`MAGICBLOCK-PLAYBOOK.MD`](./MAGICBLOCK-PLAYBOOK.MD): Solana + MagicBlock implementation playbook.
- [`client/fps-boilerplate/README.md`](./client/fps-boilerplate/README.md): active client runtime architecture, including the procedural `cube-world-ground` base-map setup (with a stone `16x16x8` replacement zone that preserves the existing top-height), first-person character runtime, and the biome-driven stylized illumination pipeline (including the new light/friendly `peak` preset plus cinematic sky/fog styling with top-locked gameplay sun, warm/cool voxel shading, high-quality directional shadows, bloom + graded post-process, FXAA).
- [`client/fps-boilerplate/DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md`](./client/fps-boilerplate/DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md): Unity 6 first-person controller parity reference and Three.js port formulas for camera, movement, animation, mining, and shader behavior.

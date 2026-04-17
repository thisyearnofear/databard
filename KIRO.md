# How Kiro Was Used

This project was built using Kiro's spec-driven development approach. Below is a summary of how each Kiro feature contributed.

## Spec-Driven Development

We started by writing specs before any code:
- `/.kiro/specs/product.md` — User stories defining the four core flows (connect, generate, play, browse)
- `/.kiro/specs/design.md` — Technical architecture, module breakdown, API routes

The specs acted as the source of truth. Kiro's agent used them to generate implementation code that stayed aligned with the design.

## Steering Docs

`/.kiro/steering/conventions.md` defines project conventions:
- File structure and naming
- ElevenLabs and OpenMetadata integration patterns
- UI design direction (dark theme, podcast-app aesthetic)

This kept Kiro's code generation consistent across the project.

## Vibe Coding

Iterative conversations with Kiro to:
- Scaffold the Next.js project structure
- Build the OpenMetadata API client
- Design the script generation prompt logic
- Wire up ElevenLabs audio synthesis

## ElevenLabs Kiro Power

Used the ElevenLabs Power plugin for accurate API guidance when integrating TTS, sound effects, and music generation — avoided reading docs manually.

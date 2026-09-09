# Figranium Embed UI contract

This directory defines the public boundary that Figranium Embed should consume.

## Goal

Figranium Embed must never maintain a visual copy of the task editor. The canonical task UI remains in Figranium under `src/components/editor` and related shared components/utilities. Embed should consume those components directly (or a package built from them), so editor redesigns flow into future Embed releases automatically.

## Scope

Embed is UI-only. It accepts Figranium task JSON and renders the task/editor surface without requiring a Figranium server.

It does not provide browser execution, Open Browser, noVNC, selector picking, scheduling, authentication, or server persistence. Applications that want execution should wire their own controls to the Figranium SDK/API.

## Compatibility rule

The source of truth is the Figranium repository. Do not fork/copy JSX or CSS into `figranium-embed`.

When editor UI changes, the Embed package should be rebuilt against the corresponding Figranium UI export. Package versions should track the Figranium release they were built from where practical.

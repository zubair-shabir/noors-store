# Storefront design system

Matched to Zubair's screen recording of the reference site (noors112.netlify.app, Oct 2026).
Tokens live in `src/app/globals.css`; shared easing curves in `src/lib/motion.ts`.

## Tokens

| Token                    | Light           | Dark      | Used for                          |
| ------------------------ | --------------- | --------- | --------------------------------- |
| `background`             | `#fdfdfd`       | `#0e0e0e` | Page                              |
| `foreground`             | `#1c1c1c`       | `#f2f2f2` | Text, rules, solid buttons        |
| `muted`                  | `#6b6b6b`       | `#a3a3a3` | Eyebrows, FAQ answers             |
| `subtle`                 | `#9a9a9a`       | `#7a7a7a` | Struck-through compare-at price   |
| `surface`                | `#f4f4f4`       | `#191919` | Feature tiles, image placeholders |
| `band`                   | `#1c1c1c`       | `#f2f2f2` | "Designed for comfort" band       |
| `statement`              | `#c9c9c9`       | `#3a3a3a` | "Our stores are more…" text       |
| Announcement bar, footer | `#000` / `#fff` | same      |                                   |

## Type

| Role             | Font             | Notes                                                              |
| ---------------- | ---------------- | ------------------------------------------------------------------ |
| Display headings | Anton            | Uppercase in hero and statements, sentence case for section titles |
| Body and UI      | Inter (variable) | Product names uppercase; actions 11px, tracking 0.14em             |
| Wordmark         | Cinzel           | Placeholder until the brand's logo file arrives                    |

Fonts are self-hosted through `@fontsource`, so builds need no network access.

## Motion

| Effect               | Where                   | Spec                                                                                                                                         |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro loader         | First visit per session | Black panel; N-O-O-R-S fade up 140ms apart, chinar leaf drops onto the S, underline draws (1.2s); panel lifts away (0.9s, ease-in-out-quart) |
| Announcement marquee | Top bar                 | Endless right-to-left, 28s loop                                                                                                              |
| Hero headline        | Home, About             | Lines slide up from a mask (1s, ease-out-expo, 120ms stagger); blur and fade out as you scroll                                               |
| Hero photo strip     | Home                    | Endless marquee (45s loop) that scales up to 1.32x as the hero scrolls away                                                                  |
| Scroll reveal        | Most blocks             | Fade up 24px from `blur(14px)` to sharp, once, 1s ease-out-expo                                                                              |
| Cursor follower      | Desktop only            | 12px dot on a spring; grows to a 96px white disc labelled "Explore" or "View" over `[data-cursor-label]`                                     |
| Category tile hover  | Home                    | Image zooms 1.04x; round detail photo pops from the bottom-left                                                                              |
| Product card hover   | Everywhere              | Cross-fade to second photo (0.7s), rule under the card draws in from the left                                                                |
| View all button      | Section headers         | Black fill sweeps in from the left                                                                                                           |
| Tilted parallax      | Home, About             | Two photos drift in opposite directions and straighten while the grey statement moves slower                                                 |
| FAQ                  | Home                    | Plus rotates into a cross; answer height animates                                                                                            |
| Drawers              | Menu, cart, search      | Slide in (0.7s, ease-in-out-quart) over a dimmed backdrop; links stagger in                                                                  |
| Smooth scroll        | Whole site              | Lenis, paused while a drawer is open                                                                                                         |

All motion turns off under `prefers-reduced-motion`.

## Placeholder images

`public/placeholder/*.webp` are cropped from the recording so the layout can be reviewed.
They are low resolution and are replaced by admin-uploaded photos (Cloudinary) in Step 4.

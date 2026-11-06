# Gold Dashboard

I made this to track my gold purchasing status, because i didn't want to check the gold price everytime, and calculate my win or losses.
So this static browser dashboard for tracking a 1 Damleung gold position make my life easier.
This is the first prototype for my new latest project goldkh which is deployed on goldkh.xyz


## Features

- Live XAU/USD spot price from goldapi.io when an API key is available.
- Manual spot price entry when the API key is missing or the request fails.
- Editable purchase price in USD.
- Editable KHR/USD exchange rate.
- P&L shown in USD, KHR, and percent.
- Break-even spot price recalculated from the purchase price.
- A brass balance scale as the main view: what you paid on one pan, your gold on the other. The beam tips with your P&L.
- "What if" pricing: drag the slider, or grab a pan and tip the scale, to see your P&L at any price.
- Price history chart you can scrub through; every day you hover puts that day's price on the scale.
- Riel value per chi (ជី), shop premium paid over spot, and break-even spot.
- Light and dark themes, phone layout with the main button in thumb reach, keyboard and screen-reader paths.

## Run

Open `index.html` in a browser.

No build step is required. The app uses plain HTML, CSS, JavaScript (no chart library), Google Fonts (Gloock, Kantumruy Pro, Moul), and browser `localStorage`.

## Optional API Key

Create `config.js` in the project root:

```js
const CONFIG = {
  GOLD_API_KEY: "goldapi-your-key-here",
};
```

`config.js` is ignored by Git. If it is missing or the key is blank, the dashboard still works with manual spot price entry.

## How The Math Works

- Current value = current spot price x `1.2055` troy ounces.
- P&L USD = current value - purchase price.
- P&L percent = P&L USD / purchase price x 100.
- P&L KHR = P&L USD x KHR/USD rate.
- Break-even spot = purchase price / `1.2055`.

## Data Storage

The dashboard stores these values in the browser:

- Custom purchase price.
- Custom KHR/USD rate.
- Last checked spot price.
- Live fetched daily history points.

Clearing site data for the page resets those saved values.

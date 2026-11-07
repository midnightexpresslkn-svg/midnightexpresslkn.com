import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { check } from "./helpers/failure.js";

const source = fs.readFileSync("js/install.js", "utf8");

function setAgent(userAgent) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
}

function mount() {
  document.body.innerHTML =
    '<p id="add-home-tip" hidden><button type="button" id="add-home-button" hidden>Add to Home Screen</button><span id="add-home-ios" hidden>Tap Share, then Add to Home Screen</span></p>';
  window.navigator.standalone = false;
  window.matchMedia = () => ({ matches: false });
}

function runInstall() {
  vm.runInThisContext(source, { filename: "js/install.js" });
}

describe("install", () => {
  it("shows the iPhone Share instruction and no install button", () => {
    mount();
    setAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    runInstall();
    check(document.getElementById("add-home-tip").hidden, false, {
      label: "iPhone tip is shown",
      source: "js/install.js:1",
    });
    check(
      document.getElementById("add-home-ios").textContent,
      "Tap Share, then Add to Home Screen",
      {
        label: "iPhone instruction",
        source: "js/install.js:1",
      },
    );
    check(document.getElementById("add-home-ios").hidden, false, {
      label: "iPhone instruction is visible",
      source: "js/install.js:1",
    });
    check(document.getElementById("add-home-button").hidden, true, {
      label: "iPhone does not show the Android button",
      source: "js/install.js:1",
    });
  });

  it("shows the Android button only after beforeinstallprompt and prompts on click", () => {
    mount();
    setAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    runInstall();
    check(document.getElementById("add-home-tip").hidden, true, {
      label: "Android tip stays hidden until the browser offers install",
      source: "js/install.js:1",
    });
    let prompted = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => {
      prompted += 1;
      return Promise.resolve();
    };
    window.dispatchEvent(event);
    const button = document.getElementById("add-home-button");
    check(button.hidden, false, {
      label: "Android install button is shown",
      source: "js/install.js:1",
    });
    check(button.textContent, "Add to Home Screen", {
      label: "Android button label",
      source: "js/install.js:1",
    });
    button.click();
    check(prompted, 1, {
      label: "button calls the browser install prompt",
      source: "js/install.js:1",
    });
    check(document.getElementById("add-home-tip").hidden, true, {
      label: "tip hides after the prompt",
      source: "js/install.js:1",
    });
  });

  it("stays quiet when the app is already installed", () => {
    mount();
    setAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    window.navigator.standalone = true;
    runInstall();
    check(document.getElementById("add-home-tip").hidden, true, {
      label: "installed app shows no tip",
      source: "js/install.js:1",
    });
  });
});

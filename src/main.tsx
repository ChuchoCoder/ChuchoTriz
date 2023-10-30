import React from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import App from "./App";

function waitForElement(selector: string) : Promise<Element | null> {
  return new Promise(resolve => {
      if (document.querySelector(selector)) {
          return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
              observer.disconnect();
              resolve(document.querySelector(selector));
          }
      });

      observer.observe(document.body, {
          childList: true,
          subtree: true
      });
  });
}

waitForElement("#MiniOrderForm > div.MiniOrderForm_buttonsBlock").then((element) => {
  console.log('Element is ready');
  
  const app = document.createElement("div");

  app.id = "root-chuchotriz";

  if (element) {
    element.append(app);
  }
  else{
    console.log("No body found");
  }

  const container = document.getElementById("root-chuchotriz");
  const root = createRoot(container!);

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
});

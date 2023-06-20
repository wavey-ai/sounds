import React, { useEffect, useRef, useState, useContext } from "react";
import { StoreContext } from "./Store";
import axios from "axios";
import { apiHost, apiToken, streamHost } from "./Api";
import { Player } from "./Player";
import { Sound } from "./Sound";

async function getPresignedURL(id) {
  const urlResponse = await axios.get(`https://${apiHost()}/sounds/${id}`, {
    headers: {
      Authorization: `Bearer ${apiToken()}`
    }
  });

  return urlResponse.data.url;
}

export const Sounds = ({ theme, mode, audioManager }) => {
  const [store, setStore] = useContext(StoreContext);
 
  return (
      <div className='min-w-full flex flex-col'>
        {store.map((item, index) => (
          <Sound item={item} audioManager={audioManager} theme={theme} mode={mode} />
        ))}
      </div>
  );
};

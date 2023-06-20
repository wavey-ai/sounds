import React, { createContext, useState, useEffect } from "react";
import axios from "axios";
import { OpusDecoderWebWorker } from "opus-decoder";
import { apiHost, apiToken } from './Api';

export const StoreContext = createContext();


let done = false;

export const StoreProvider = ({ children, }) => {
  const [store, setStore] = useState([]);
  const [initialFetch, setInitialFetch] = useState(false);

  const refreshData = async () => {
    if (apiToken()) {
      const urlResponse = await axios.get(`https://${apiHost()}/sounds`, {
        headers: {
          Authorization: `Bearer ${apiToken()}`
        }
      });
      const data = urlResponse.data;
      setStore(data || []);
      setInitialFetch(true);
    }
  };

  useEffect(() => {
    if (!initialFetch) {
      refreshData();
    }
  });

  return <StoreContext.Provider value={[store, setStore, refreshData]}>{children}</StoreContext.Provider>;
};

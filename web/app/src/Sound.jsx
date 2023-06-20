import React, { useEffect, useRef, useState, useContext } from "react";
import axios from "axios";
import { apiHost, apiToken, streamHost } from "./Api";
import { Player } from "./Player";

export const Sound = ({ item, theme, mode, audioManager }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div key={item.key}>
        {!expanded ? (
          <div className='pl-4 flex flex-row mb-2 bg-white-50 text-zinc-800'>
            <section className='w-1/2'>
              <Player audioManager={audioManager} soundId={item.key} theme={theme} mode={mode} tiny={true} />
            </section>
            <section className='ml-20 mt-4 flex-row text-xs'>
              <div className='flex'>
                <div
                  className='ml-16 cursor-pointer text-md font-bold flex-row flex font-mono'
                  onClick={() => {
                    setExpanded(!expanded);
                  }}
                >
                  Mixer
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 24 24'
                    fill='currentColor'
                    className='w-6 h-6 flex-row flex ml-2 -mt-1'
                  >
                    <path
                      fillRule='evenodd'
                      d='M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z'
                      clipRule='evenodd'
                    />
                  </svg>
                </div>
              </div>
            </section>
 
          <section className='ml-34 flex-row '>
              <p className='mt-4 ml-8 text-xs font-semibold font-sans subpixel-antialiased overflow-hidden overflow-ellipsis truncate w-64'>
                {item.filename}{" "}
              </p>
            </section>
         </div>
        ) : (
          <div className='pl-4 text-xs bg-zinc-100 border-zinc-100'>
            <Player audioManager={audioManager} soundId={item.key} theme={theme} mode={mode} tiny={false} />
            <div className='flex flex-row'>
                   <div
                className='cursor-pointer ml-8 text-md font-bold flex font-mono text-zinc-600'
                onClick={() => {
                  setExpanded(!expanded);
                }}
              >
                Mixer
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='currentColor'
                  className='w-6 h-6  ml-2 -mt-1'
                >
                  <path
                    fillRule='evenodd'
                    d='M11.47 7.72a.75.75 0 011.06 0l7.5 7.5a.75.75 0 11-1.06 1.06L12 9.31l-6.97 6.97a.75.75 0 01-1.06-1.06l7.5-7.5z'
                    clipRule='evenodd'
                  />
                </svg>
              </div>
              <p className='text-slate-950 pb-12 ml-8 font-semibold text-md font-sans subpixel-antialiased'>
        
                {item.filename}{" "}
              </p>

          </div>
          </div>
        )}
    </div>
  );
};

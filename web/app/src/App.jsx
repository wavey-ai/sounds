import React, { createContext, useContext, useState, useEffect, useRef, useLayoutEffect } from "react";

import jwt_decode from "jwt-decode";
import axios from "axios";
import { Sounds } from "./Sounds";
import { StoreProvider, StoreContext } from "./Store";
import { apiHost, apiToken } from "./Api";
import { Player } from "./Player";
import { AudioManager } from "./AudioManager";

function decodeUint8Array(uint8Array) {
  const decodedArray = new Array(uint8Array.length);
  for (let i = 0; i < uint8Array.length; i++) {
    const byte = uint8Array[i];
    const signBit = byte & 0b1000_0000; // Extract the sign bit
    const value = byte & 0b0111_1111; // Extract the value without the sign bit
    const decodedValue = signBit ? -(value & 0b0111_1111) : value;
    decodedArray[i] = decodedValue;
  }
  return decodedArray;
}

function RawImageRenderer() {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [imgSrc, setImgSrc] = useState("/debug.png");
  const [canvasX, setCanvasX] = useState(0);
  const [canvasY, setCanvasY] = useState(512);
  const channelsRef = useRef(null);
  const samplesRef = useRef(null);

  const processRawFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      renderWaveform(data);
    };
    reader.readAsArrayBuffer(file);
  };

  useLayoutEffect(() => {
    // Callback function to execute after canvas size has rendered
    const handleCanvasSizeRendered = () => {
      // Perform actions here, after canvas size has been set
      console.log("Canvas size rendered!");
    };

    // Check if canvas size has been set
    if (canvasX > 0) {
      const cols = [
        [217, 70, 239],
        [34, 197, 94]
      ];

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      const channelCount = channelsRef.current;
      const samples = samplesRef.current;
      for (let i = 0; i < channelCount; i++) {
        const points = [];

        for (let x = 0; x < samples[i].length; x += 2) {
          const y = samples[i][x] + 255;
          const z = samples[i][x + 1] + 255;
          points.push({ x: x / 2, y, z });
        }

        const col = cols[i];
        ctx.beginPath();
        ctx.globalCompositeOperation = "screen";
        ctx.moveTo(points[0].x, points[0].y);
        ctx.strokeStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
        ctx.lineWidth = 0.5;

        for (let j = 1; j < points.length; j++) {
          const p = points[j];
          const x = p.x;
          const y = p.y;
          const z = p.z;

          ctx.globalCompositeOperation = "screen";
          ctx.strokeStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, 255);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, z);
          ctx.lineTo(x, 255);
          ctx.stroke();
        }
     }
        setImgSrc(canvasRef.current.toDataURL("image/png"));
 
    }
  }, [canvasX]);

  const renderWaveform = (data) => {
    const height = 512;
    const channelCount = data[0];
    const dataStartOffset = 1;

    const samples = [];
    for (let i = 0; i < channelCount; i++) {
      samples[i] = [];
    }

    const pcm = decodeUint8Array(data).slice(1);

    for (let i = 0; i < pcm.length; i += channelCount) {
      for (let j = 0; j < channelCount; j++) {
        samples[j].push(pcm[i + j]);
      }
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    samplesRef.current = samples;
    channelsRef.current = channelCount;
    let width = samples[0].length/2;
    setCanvasX(width);
  };

  return (
    <div className='m-8'>
      <input
        type='file'
        onChange={(evt) => {
          const file = evt.target.files[0];
          processRawFile(file);
        }}
      />
      <div classNamez='saturate-200 hue-rotate-15 backdrop-contrast-200'>
          <img className='bg-slate-50 mt-4 drop-shadow-lg p-2 w-full' style={{ width: `100%`, height: "128px" }} ref={imageRef} src={imgSrc} />
      </div>  
    <canvas width={canvasX} height={canvasY} ref={canvasRef} className='bg-gradient-to-b from-white to-gray-50' />
    </div>
  );
}

const FileUpload = () => {
  const [files, setFiles] = useContext(FilesContext);
  const [uploading, setUploading] = useState(false);
  const [store, setStore, refreshData] = useContext(StoreContext);

  const handleFileInputChange = (event) => {
    const files = Array.from(event.target.files);
    const newFiles = files.reduce((obj, file) => {
      obj[file.name] = {
        file: file,
        progress: 0
      };
      return obj;
    }, {});
    setFiles(newFiles);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const pendingFilenames = [];

    if (!Object.keys(files).length) {
      alert("Please select a file to upload");
      return;
    }

    setUploading(true);

    for (let fileName in files) {
      const file = files[fileName].file;
      try {
        const urlResponse = await axios.get(`https://${apiHost()}/upload?filename=${encodeURIComponent(file.name)}`, {
          headers: {
            Authorization: `Bearer ${apiToken()}`
          }
        });

        const presignedUrl = urlResponse.data.url;

        const uploadConfig = {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setFiles((prevFiles) => ({
              ...prevFiles,
              [fileName]: {
                ...prevFiles[fileName],
                progress: percentCompleted
              }
            }));
          }
        };

        await axios.put(presignedUrl, file, {
          headers: {
            "Content-Type": file.type
          },
          ...uploadConfig
        });

        pendingFilenames.push(file.name);
      } catch (error) {
        console.error(error);
      }
    }

    setUploading(false);
  };

  return (
    <div className=''>
      <form onSubmit={handleFormSubmit} className=''>
        <div className='p-4'>
          <input
            className='hidden' // Hide the default input
            id='file-input' // Add an id to associate with the label
            type='file'
            onChange={handleFileInputChange}
            multiple
          />

          {Object.keys(files).length ? (
            <div className='flex flex-col items-center'>
              <button
                className='pl-4 pr-4 pt-1 pb-1 flex-shrink-0 bg-blue-500 hover:bg-blue-700 border-blue-500 hover:border-blue-700 text-sm border-4 text-white rounded'
                type='submit'
                disabled={!Object.keys(files).length}
              >
                Upload
              </button>
            </div>
          ) : (
            <div className='flex flex-col items-center'>
              <label
                htmlFor='file-input' // Associate the label with the input
                className='cursor-pointer ml-4 pl-4 pr-4 pt-1 pb-1 flex-shrink-0 bg-blue-500 hover:bg-blue-700 border-blue-500 hover:border-blue-700 text-sm border-4 text-white rounded'
              >
                Select audio
              </label>
              <p className='text-gray-500 mt-4'>
                You can select any audio files but <em>.wav</em> or <em>.aiff</em> are recommended
              </p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

function Uploads() {
  const [files, setFiles] = useContext(FilesContext);

  return (
    <div className='p-4'>
      {Object.keys(files).length ? (
        <div className='space-y-4'>
          {Object.keys(files).map((fileName, index) => (
            <div key={index} className='w-full flex flex-col md:flex-row'>
              <div className='text-xs w-full w-3/4 pr-2'>{fileName}</div>
              <div className='w-full w-1/4'>
                {files[fileName].progress < 100 ? (
                  <div className='w-md bg-gray-200 rounded-full h-3 dark:bg-gray-700 mt-2'>
                    <div
                      className='bg-blue-600 h-3 rounded-full transition-all ease-out duration-500'
                      style={{ width: `${files[fileName].progress}%` }}
                    ></div>
                  </div>
                ) : (
                  <></>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}

const FilesContext = createContext();

const FilesProvider = ({ children }) => {
  const [files, setFiles] = useState([]);
  return <FilesContext.Provider value={[files, setFiles]}>{children}</FilesContext.Provider>;
};

function Tasks({ task }) {
  return (
    <div className='m-4 bg-gray-50'>
      {task === "upload" && (
        <>
          <Uploads />
          <FileUpload />
        </>
      )}
    </div>
  );
}

let audioCtx = new AudioContext();

export default function App() {
  const [user, setUser] = useState(null);
  const [jwt, setJwt] = useState(null);
  const [task, setTask] = useState(null);
  const [theme, setTheme] = useState("channel");
  const [mode, setMode] = useState("separate");
  const [soundId, setSoundId] = useState(null);

  const audioManager = AudioManager();

  return (
    <div className='flex min-h-screen flex-col w-full'>
      <StoreProvider>
        <main className='flex flex-1 flex-col w-full'>
          <header className='border-b border-1 bg-white hidden' style={{ borderColor: "#ff04c7" }}>
            <div className='w-full px-4 container flex h-16 items-center'>
              <div className='flex flex-1 items-start'>
                <div className='flex-shrink-0 rounded bg-gradient-to-r from-slate-800 via-slate-950 to-slate-700'>
                  <a className='flex flex-none items-start' href='/'>
                    <img alt='logo' className='w-14' src='/wavey.png' />
                  </a>
                </div>
                <span className='text-sm p-4 font-semibold' style={{ color: "#ff04c7" }}>
                  wavey<span className='text-slate-800'>.ai</span>
                </span>
                <div className='hidden relative ml-4 mt-2 flex-1 lg:max-w-sm mr-2 sm:mr-4 lg:mr-6'>
                  <input
                    autoComplete='off'
                    className='w-md dark:bg-gray-950 pl-8 border rounded h-9 pr-3 border-zinc-300'
                    name=''
                    placeholder='Search...'
                    spellCheck='false'
                    type='text'
                  />
                  <svg
                    className='absolute left-2.5 text-gray-400 top-1/2 transform -translate-y-1/2'
                    aria-hidden='true'
                    focusable='false'
                    role='img'
                    width='1em'
                    height='1em'
                    viewBox='0 0 32 32'
                  >
                    <path
                      d='M30 28.59L22.45 21A11 11 0 1 0 21 22.45L28.59 30zM5 14a9 9 0 1 1 9 9a9 9 0 0 1-9-9z'
                      fill='currentColor'
                    ></path>
                  </svg>
                </div>
              </div>
              <nav className='flex items-start flex-1 hidden sm:block'>
                <ul className='flex space-x-8 text-base font-semibold'>
                  <li className=''>
                    <a
                      className='flex items-start text-zinc-100 px-2 py-0.5 dark:hover:text-gray-400 hover:text-sky-600'
                      href='/'
                    >
                      sounds
                    </a>
                  </li>
                </ul>
              </nav>
              <nav className='flex items-end '>
                <ul className='flex space-x-2'>
                  <li>{user ? <LogoutButton domain={domain} /> : <p></p>}</li>
                </ul>
              </nav>
            </div>
          </header>
          <FilesProvider>
            <div className='bg-gray-50 flex p-4'>
              <div className='flex flex-row sm:flex-row'>
                <section className='text-sm w-full sm:w-80 flex-row border-gray-100 bg-white lg:border-r lg:bg-gradient-to-l from-gray-50 to-white font-mono'>
                  <div className='mb-3'>
                    <div className=' text-indigo-600'>
                      <a
                        className='mr-2 flex items-center hover:text-pink-400 rounded-md bg-white text-xs pr-2'
                        href='#'
                        onClick={() => {
                          setTask("upload");
                        }}
                      >
                        <div className='relative p-1'>
                          <div className='absolute z-0 inset-0 bg-gradient-to-b from-gray-100 to-blue-100' />
                          <svg
                            xmlns='http://www.w3.org/2000/svg'
                            fill='none'
                            viewBox='0 0 24 24'
                            strokeWidth={0.5}
                            stroke='currentColor'
                            className='w-4 h-4 relative'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75'
                            />
                          </svg>
                        </div>
                        <span className='ml-2 text-slate-900'>Upload Sounds</span>
                      </a>
                      <a
                        className='mt-2 mr-2 flex items-center hover:text-pink-400 rounded-md bg-white text-xs pr-2'
                        href='#'
                        onClick={() => {
                          setTask("tag");
                        }}
                      >
                        <div className='relative p-1'>
                          <div className='absolute z-0 inset-0 bg-gradient-to-b from-gray-100 to-blue-100' />
                          <svg
                            xmlns='http://www.w3.org/2000/svg'
                            fill='none'
                            viewBox='0 0 24 24'
                            strokeWidth={0.5}
                            stroke='currentColor'
                            className='w-4 h-4 relative'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z'
                            />
                            <path strokeLinecap='round' strokeLinejoin='round' d='M6 6h.008v.008H6V6z' />
                          </svg>
                        </div>
                        <span className='ml-2 text-slate-900'>Tag Tracks</span>
                      </a>
                    </div>
                  </div>
                </section>
              </div>
            </div>
            <div className='w-full sm:flex-1 bg-zinc-100'>
              <RawImageRenderer />
              <Tasks task={task} />
              <Sounds theme={theme} mode={mode} audioManager={audioManager} />
            </div>
          </FilesProvider>
        </main>
      </StoreProvider>
    </div>
  );
}

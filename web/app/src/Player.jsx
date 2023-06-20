import React, { useMemo, useEffect, useRef, useState, useContext } from "react";
import axios from "axios";
import { OpusDecoderWebWorker } from "opus-decoder";
import { apiHost, streamHost, apiToken } from "./Api";
import Peaks from "peaks.js";
import { Range } from "react-range";

const Waveform = ({ audioData, sampleWindowLength, col }) => {
  const canvasRef = useRef(null);

  // Create a state for the samples window
  const [sampleWindow, setSampleWindow] = useState([]);

  useEffect(() => {
    // Update the sample window whenever new audioData is received
    if (audioData && audioData.length > 0) {
      setSampleWindow((prevWindow) => {
        // Create a new array with the old samples and new samples
        const newWindow = [...prevWindow, ...audioData];
        // If the window is too large, slice it down to the desired size
        return newWindow.length > sampleWindowLength
          ? newWindow.slice(newWindow.length - sampleWindowLength)
          : newWindow;
      });
    }
  }, [audioData]);

  useEffect(() => {
    if (sampleWindow.length > 0) {
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      context.fillStyle = col;

      // Clear the canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the waveform
      for (let i = 0; i < sampleWindow.length; i++) {
        const x = (i * canvas.width) / sampleWindow.length;
        const y = ((1 + sampleWindow[i]) * canvas.height) / 2;
        context.fillRect(x, y, 0.5, 0.5);
      }
    }
  }, [sampleWindow, canvasRef]);

  return <canvas ref={canvasRef} className='-left-200 -top-12 absolute' width={2000} height={100} />;
};

function msToTime(duration) {
  var milliseconds = parseInt((duration % 1000) / 100),
    seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60);

  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;

  return minutes + ":" + seconds + ":" + milliseconds;
}

async function getWaveformData(id) {
  const urlResponse = await axios.get(`https://${streamHost()}/av/${id}/${id}_waveform.dat`, {
    headers: {
      Authorization: `Bearer ${apiToken()}`
    },
    responseType: "blob"
  });

  return urlResponse.data;
}

async function getWaveform(id) {
  const urlResponse = await axios.get(`https://${streamHost()}/png-fs8/${id}/wave.png`, {
    headers: {
      Authorization: `Bearer ${apiToken()}`
    },
    responseType: "blob"
  });

  return urlResponse.data;
}

async function getSonograph(id, type) {
  const file = `sono-${type}.png`;

  const urlResponse = await axios.get(`https://${streamHost()}/png-fs8/${id}/${file}`, {
    headers: {
      Authorization: `Bearer ${apiToken()}`
    },
    responseType: "blob"
  });

  return urlResponse.data;
}

function pcmToDb(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    sum += Math.abs(pcm[i]);
  }

  const avgAmplitude = sum / pcm.length;

  // Check for silence and return -Infinity dB
  if (avgAmplitude === 0) {
    return -Infinity;
  }

  const dbFs = 20 * Math.log10(avgAmplitude);

  return dbFs;
}

function LevelMeter({ dbFs, tiny }) {
  const totalBlocks = tiny ? 7 : 24;
  const [activeBlocks, setActiveBlocks] = useState(Math.max(0, Math.round((dbFs + 60) / (tiny ? 10 : 2))));

  useEffect(() => {
    setActiveBlocks(Math.max(0, Math.round((dbFs + 60) / (tiny ? 10 : 2))));
    const timeout = setTimeout(() => {
      setActiveBlocks(-60);
    }, 500);

    // Cleanup function
    return () => {
      clearTimeout(timeout);
    };
  }, [dbFs]);

  let blocks = [];
  for (let i = 0; i < totalBlocks; i++) {
    let color = "white"; // Default color for inactive blocks
    if (i < activeBlocks) {
      if (tiny) {
        if (i < 4) {
          color = "#ff04c7";
        } else if (i < 6) {
          color = "#facc15";
        } else {
          color = "#ef4444";
        }
      } else {
        if (i < (totalBlocks * 5) / 6) {
          color = "#ff04c7";
        } else if (i < totalBlocks - 1) {
          color = "#facc15";
        } else {
          color = "#ef4444";
        }
      }
    }
    blocks.push(
      <div
        key={i}
        className={`w-full`}
        style={{ height: tiny ? "6px" : "6px", marginBottom: "1px", backgroundColor: color }}
      ></div>
    );
  }

  return (
    <div
      className={`w-2 ${tiny ? "h-12" : "h-40"} bg-gray-200 border flex flex-col-reverse`}
      style={{ marginRight: "1px" }}
    >
      {blocks}
    </div>
  );
}

function formatTime(milliseconds, round) {
  let totalSeconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;

  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;

  if (round) {
    let millis = Math.floor((milliseconds % 1000) / round) * round;
    millis = millis < 100 ? (millis < 10 ? "00" + millis : "0" + millis) : millis;

    return minutes + ":" + seconds + "." + millis;
  } else {
    return minutes + ":" + seconds;
  }
}

export const Player = ({ audioManager, soundId, theme, mode, tiny }) => {
  const [currentMode, setCurrentMode] = useState(null);
  const [currentSoundId, setCurrentSoundId] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(null);
  const [dbL, setDbL] = useState(-60);
  const [dbR, setDbR] = useState(-60);
  const [imageSonoEqBlob, setImageSonoEqBlob] = useState(null);
  const [imageSonoUeBlob, setImageSonoUeBlob] = useState(null);
  const [imageWaveBlob, setImageWaveBlob] = useState(null);
  const [isStopped, setIsStopped] = useState(true);
  const [totalTime, setTotalTime] = useState(null);
  const [displayTime, setDisplayTime] = useState(0);
  const [waveData, setWaveData] = useState(null);
  const containerRef = useRef(null);
  const cues = useRef(null);
  const currentFrame = useRef(0);
  const currentPlayId = useRef(null);
  const frames = useRef(null);
  const sonoRef = useRef(null);
  const sonoWidth = useRef(null);
  const imageSonoRef = useRef(null);
  const isDragging = useRef(false);
  const isPlaying = useRef(false);
  const nextStartTime = useRef(0);
  const playPosRef = useRef(null);
  const playheadRef = useRef(null);
  const progressBarRef = useRef(null);
  const decoder = useMemo(() => new OpusDecoderWebWorker({ channels: 2 }), []);
  const isTiny = useRef(true);
  const zoomWaveRef = useRef(null);
  const waveRef = useRef(null);
  const peaksInstance = useRef(null);
  const peaksEvts = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sampleRateVal, setSampleRateVal] = React.useState([48000]);
  const sampleRate = useRef(48000);
  const sampleSize = useRef(120);
  const startRecordAt = useRef(null);
  const [draftClips, setDraftClips] = useState([]);
  const [clips, setClips] = useState([]);
  const isRecordingRef = useRef(isRecording); // declare this in your component

  const trueSampleRate = 48000;

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isPlaying.current && event.key === "c") {
        if (isRecordingRef.current) {
          const endTime = roundTime(frameToSeconds(currentFrame.current), 5);
          const startTime = roundTime(peaksInstance.current.points.getPoints()[0].time, 5);
          peaksInstance.current.points.removeAll();
          const clip = {
            startTime,
            endTime,
            editable: true
          };
          peaksInstance.current.segments.add(clip);
          setDraftClips((clips) => [...clips, clip]);
        } else {
          const start = frameToSeconds(currentFrame.current);
          peaksInstance.current.points.add({
            time: start,
            editable: true
          });
        }

        setIsRecording((isRecording) => !isRecordingRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function createClips(newClips, sampleRate) {
    const req = [];
    for (let i = 0; i < newClips.length; i++) {
      const c = newClips[i];
      req.push({
        start: secondsToFrame(c.startTime),
        end: secondsToFrame(c.endTime),
        sound: soundId,
        hz: sampleRate
      });
    }
    try {
      const urlResponse = await axios.post(`https://${apiHost()}/clips`, req, {
        headers: {
          Authorization: `Bearer ${apiToken()}`
        },
        responseType: "json"
      });

      const savedClips = urlResponse.data;

      const newDraftClips = draftClips.filter((draftClip) => {
        return !savedClips.some((savedClip) => {
          return draftClip.startTime == savedClip.startTime && draftClip.endTime == savedClip.endTime;
        });
      });

      setDraftClips(newDraftClips);
      setClips((clips) => [...clips, ...savedClips]); // I changed this line to spread savedClips array

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async function getClips(id) {
    try {
      const urlResponse = await axios.get(`https://${apiHost()}/clips/${id}`, {
        headers: {
          Authorization: `Bearer ${apiToken()}`
        },
        responseType: "json"
      });

      setClips(urlResponse.data);

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function roundTime(t, ms) {
    return (Math.floor((t * 1000) / ms) * ms) / 1000;
  }

  function resetDraftClips() {
    const clips = peaksInstance.current.segments.getSegments();
    peaksInstance.current.segments.removeAll();
    const res = [];
    for (let i = 0; i < clips.length; i++) {
      const c = {
        startTime: roundTime(clips[i].startTime, 5),
        endTime: roundTime(clips[i].endTime, 5),
        editable: true
      };

      peaksInstance.current.segments.add(c);
      res.push(c);
    }
    setDraftClips(res);
  }

  function easeInQuad(x) {
    return Math.pow(x, 2);
  }

  function handleMouseDown(e) {
    isPlaying.current = false;
    isDragging.current = true;
  }

  function handleMouseMove(e) {
    if (!isDragging.current) return;
    goToFrame(getProgressFrame(e.clienttX));
  }

  function getProgressFrame(clientX) {
    const totalFrames = cues.current.length;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.right - rect.left;
    return Math.floor((x / width) * totalFrames);
  }

  function handleMouseUp(e) {
    const frame = getProgressFrame(e.clientX);
    goToFrame(frame);
    playAtFrame(frame);
  }

  function playAtFrame(frame, endFrame) {
    isDragging.current = false;
    isPlaying.current = true;
    setIsStopped(false);
    nextStartTime.current = 0;
    accumulateSamples(frame, newPlayId(), endFrame);
    if (peaksEvts.current) {
      const t = frameToSeconds(frame);
      peaksEvts.current.emit("player.playing", t);
      peaksEvts.current.emit("player.timeupdate", t);
    }
  }

  function goToFrame(f) {
    const t = frameToSeconds(f);
    goTo(t);
  }

  function goTo(t) {
    const idx = secondsToFrame(t);
    if (peaksEvts.current) {
      peaksEvts.current.emit("player.seeked", t);
      peaksEvts.current.emit("player.timeupdate", t);
    }
    const progress = idx / cues.current.length;
    let translateDistance;
    if (sonoRef.current) {
      translateDistance = -1 * (idx * (sonoWidth.current / cues.current.length));
      sonoRef.current.style.transform = `translateX(${translateDistance}px)`;
    }

    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${progress})`;
      progressBarRef.current.style.transformOrigin = "left";
    }
  }

  function playAt(t, t2) {
    isDragging.current = false;
    isPlaying.current = true;
    setIsStopped(false);
    nextStartTime.current = 0;
    const frame = secondsToFrame(t);
    let endFrame;
    if (t2) {
      endFrame = secondsToFrame(t2);
      accumulateSamples(frame, newPlayId(), endFrame);
    } else {
      accumulateSamples(frame, newPlayId());
    }
    if (peaksEvts.current) {
      peaksEvts.current.emit("player.playing", t);
      peaksEvts.current.emit("player.timeupdate", t);
    }
  }

  function secondsToFrame(t) {
    return Math.floor((t * trueSampleRate) / sampleSize.current);
  }

  function frameToSeconds(i) {
    return (i * sampleSize.current) / trueSampleRate;
  }

  function newPlayId() {
    const id = (Math.random() * 2 ** 32) >>> 0;
    currentPlayId.current = id;
    return id;
  }

  function playerTime() {
    return frameToSeconds(currentFrame.current);
  }

  function pausePlaying() {
    isPlaying.current = false;
    setIsStopped(true);
    if (peaksEvts.current) peaksEvts.current.emit("player.pause", playerTime());
  }

  function togglePlaying() {
    const frame = currentFrame.current;
    isPlaying.current ? pausePlaying() : playAtFrame(frame);
  }

  function streamUrl(id) {
    return `https://${streamHost()}/stream/${id}/${id}_stream_96k`;
  }

  useEffect(() => {
    setCurrentTheme(theme);
    setCurrentMode(mode);
    setCurrentSoundId(soundId);
    getCues(soundId);
    currentFrame.current = 0;
    getWaveform(soundId).then(async (blob) => {
      const objectUrl = URL.createObjectURL(blob);
      setImageWaveBlob(objectUrl);
    });
    getClips(soundId);

    return () => pausePlaying();
  }, [soundId]);

  useEffect(() => {
    if (!tiny && isTiny.current) {
      isTiny.current = false;
      getSonograph(soundId, "eq0").then(async (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        setImageSonoEqBlob(objectUrl);
        let img = new Image();
        img.onload = function () {
          sonoWidth.current = img.naturalWidth;
        };
        img.src = objectUrl;
      });
      getSonograph(soundId, "ue0").then(async (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        setImageSonoUeBlob(objectUrl);
      });
      getWaveformData(soundId).then(async (blob) => {
        const buf = await blob.arrayBuffer();
        const player = {
          init: function (eventEmitter) {
            peaksEvts.current = eventEmitter;
            return Promise.resolve();
          },
          destroy: function () {},
          play: function () {
            const ts = playerTime();
            playAt(ts);
          },
          pause: function () {
            pausePlaying();
          },
          seek: function (time) {
            goTo(time);
          },
          isPlaying: function () {
            return isPlaying.current;
          },
          isSeeking: function () {
            return isDragging.current;
          },
          getCurrentTime: function () {
            return playerTime();
          },
          getDuration: function () {
            return cues.current.length * 200;
          }
        };

        const options = {
          containers: {
            overview: waveRef.current,
            zoomview: zoomWaveRef.current
          },
          keyboard: true,
          logger: console.error.bind(console),
          // createSegmentMarker: createSegmentMarker,
          // createSegmentLabel: createSegmentLabel,
          //  createPointMarker: createPointMarker

          player,
          waveformData: {
            arraybuffer: buf
          },
          zoomview: {
            waveformColor: "rgb(228,228,231)",
            playheadColor: "rgb(212,212,216)"
          }
        };

        Peaks.init(options, function (err, peaks) {
          if (err) {
            console.error("Failed to initialize Peaks instance: " + err.message);
            return;
          }

          peaks.on("segments.dragend", function () {
            resetDraftClips();
          });

          peaksInstance.current = peaks;
        });
      });
    }
  }, [tiny]);

  async function accumulateSamples(frameIdx, playId, endFrameIdx, bufferSize, fromPkt, startTime, fetchEvery, tick) {
    if (endFrameIdx && frameIdx > endFrameIdx) pausePlaying();
    if (!isPlaying.current) return;
    if (playId != currentPlayId.current) return;
    currentFrame.current = frameIdx;
    if (!cues.current) await getCues(soundId);
    if (!tick) tick = 0;
    if (!fetchEvery) fetchEvery = 100;
    if (!bufferSize) bufferSize = 5;

    const f = frames.current;
    let endIdx = frameIdx + bufferSize;
    if (endIdx >= f.length) endIdx = f.length - 1;
    let nextFromPkt = fromPkt;

    if (tick % fetchEvery == 0) {
      if (!fromPkt) fromPkt = frameIdx;
      nextFromPkt = fromPkt;
      const c = cues.current;
      let toPkt = fromPkt + 2000;
      if (c.length - 1 < toPkt) {
        toPkt = c.length - 1;
      }

      let fetch = false;

      loop: for (let i = 0; i < toPkt - fromPkt; i++) {
        if (f[i + fromPkt] == null) {
          for (j = i; j < toPkt - fromPkt; j++) {
            if (!f[j]) f[j] = 1;
          }
          getData(soundId, i + fromPkt, toPkt);
          break loop;
        }
      }

      nextFromPkt += 2000;
    }

    tick += 1;

    if (!f[endIdx] || f[endIdx] == 1) {
      console.log(`miss ${endIdx} ${tick}`);
      // TODO fix last packet issues
      if (endIdx < f.length - 1) {
        setTimeout(
          () => accumulateSamples(frameIdx, playId, endFrameIdx, bufferSize, nextFromPkt, startTime, fetchEvery, tick),
          50
        );
        return;
      } else {
        return;
      }
    }

    // schedule bufffers in pairs, such that:
    // 1) buffer 0 is pre-scheduled to start immediatly after buffer 1
    // 2) buffer 0 schedules subsequent pair via its onend event (this
    //    scheduling happens as buffer 1 starts to play)
    if (!startTime) startTime = audioManager.currentTime();

    for (let i = 0; i < 2; i++) {
      const thisIdx = frameIdx + i * bufferSize;
      let bufIdx = thisIdx + bufferSize;
      if (bufIdx > endFrameIdx) budIdx = endFrameIdx;
      const { channelData, samplesDecoded } = await decoder.decodeFrames(f.slice(thisIdx, bufIdx));

      if (!isPlaying.current) return;

      const dur = samplesDecoded / sampleRate.current;
      const nextIdx = frameIdx + bufferSize * 2;
      const thisStartTime = i == 0 ? startTime : startTime + dur;
      let px;
      if (sonoRef.current) px = `${-1 * (thisIdx * (sonoWidth.current / f.length))}px`;
      if (nextIdx > f.length) audioManager.play(channelData, sampleRate.current, thisStartTime);
      const nextStartTime = dur * 2 + startTime;
      const progress = (thisIdx / f.length) * 100;
      const cb = () => {
        if (!isPlaying.current) return;
        if (i == 0)
          accumulateSamples(nextIdx, playId, endFrameIdx, bufferSize, nextFromPkt, nextStartTime, fetchEvery, tick);
        goToFrame(thisIdx);
        if (peaksEvts.current) {
          if (thisIdx % 100 == 0) peaksEvts.current.emit("player.timeupdate", frameToSeconds(thisIdx));
        }
        setDisplayTime(frameToSeconds(thisIdx + bufferSize) * 1000);
        const db = pcmToDb(channelData[i]);
        i == 0 ? setDbL(db) : setDbR(db);
      };
      audioManager.play(channelData, sampleRate.current, thisStartTime, cb);
      if (nextIdx + bufferSize >= cues.current.length) setIsStopped(true);
    }
  }

  async function getCues(id) {
    if (cues.current) {
      return cues.current;
    }

    const samplesPerFrame = sampleSize.current; // need to add this to the header
    let range = `bytes=0-4`;
    let response = await fetch(streamUrl(id), { headers: { Range: range, Authorization: `Bearer ${apiToken()}` } });
    let buffer = await response.arrayBuffer();
    let view = new DataView(buffer);
    let nPackets = view.getUint32(0, true);
    setTotalTime(((nPackets * sampleSize.current) / sampleRate.current) * 1000);
    const dataOffset = 4 + nPackets * 4;
    range = `bytes=4-${dataOffset}`;
    response = await fetch(streamUrl(id), { headers: { Range: range, Authorization: `Bearer ${apiToken()}` } });
    buffer = await response.arrayBuffer();
    view = new DataView(buffer);

    res = [];
    for (let i = 0; i < nPackets; i++) {
      let cue = view.getUint32(i * 4, true);
      res.push(cue);
    }

    const arr = [];
    for (let i = 0; i < res.length; i++) {
      arr[i] = null;
    }
    frames.current = arr;
    cues.current = res;
  }

  async function getData(id, fromPkt, toPkt) {
    const dataOffset = 4 + cues.current.length * 4;

    const c = cues.current;

    const fromByte = dataOffset + c[fromPkt];
    let toByte = dataOffset + c[toPkt];
    if (toPkt == c.length - 1) toByte = "";

    console.log(`GET packets ${fromPkt} to ${toPkt}`);

    const response = await fetch(streamUrl(id), {
      headers: {
        Range: `bytes=${fromByte}-${toByte}`,
        Authorization: `Bearer ${apiToken()}`
      }
    });
    buffer = await response.arrayBuffer();
    view = new DataView(buffer);

    if (dataOffset + c[toPkt] - fromByte < buffer.byteLength - 1) toPkt++;

    let offset = 0;
    for (let i = fromPkt; i < toPkt; i++) {
      const flagAndConfig = view.getUint8(offset, true);
      const encodingFlag = (flagAndConfig & 0xe0) >> 5;
      const configId = flagAndConfig & 0x1f;
      const channelCount = view.getUint8(offset + 1, true);
      //console.log(`EncodingFlag ${encodingFlag} ConfigId ${configId} ChannelCount ${channelCount}`);
      const pktHeaderSize = 4;
      const frameSize = view.getUint16(offset + 2, true);
      const data = view.buffer.slice(offset + 4, offset + 4 + frameSize, true);
      offset += 4 + frameSize;
      if (encodingFlag === 1) {
        frames.current[i] = data;
      }
    }
  }

  return (
    <>
      {tiny ? (
        <div>
          <div className='flex'>
            <div className='justify-start flex mr-2'>
              <LevelMeter dbFs={dbL} tiny={true} />
              <LevelMeter dbFs={dbR} tiny={true} />
            </div>
            <div
              className='w-full flex-shrink-0 relative h-12 overflow-hidden cursor-pointer'
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <img
                src={imageWaveBlob}
                className='absolute'
                style={{ width: "100%", height: "28px", top: "12px", opacity: "0.6" }}
                alt=''
              />
              <div
                ref={progressBarRef}
                className='absolute w-full h-full border-r'
                style={{
                  transformOrigin: "left",
                  willChange: "transform",
                  borderColor: "#ff04c7",
                  backgroundColor: "rgba(255, 255, 255, 0.5)"
                }}
              ></div>
            </div>
            <div className='mt-4 ml-4 cursor-pointer flex' onClick={togglePlaying}>
              {isStopped ? (
                <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#d4d4d8' className='w-4 h-4'>
                  <path
                    fillRule='evenodd'
                    d='M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z'
                    clipRule='evenodd'
                  />
                </svg>
              ) : (
                <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4'>
                  <path
                    fillRule='evenodd'
                    d='M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z'
                    clipRule='evenodd'
                  />
                </svg>
              )}
            </div>

            <p className='font-semibold text-xs mt-4 ml-4 text-zinc-300'>{formatTime(totalTime)}</p>
          </div>
        </div>
      ) : (
        <div className='pb-8 w-full'>
          <div className='flex mr-2'>
            <div className='justify-start flex mr-2'>
              <LevelMeter dbFs={dbL} />
              <LevelMeter dbFs={dbR} />
            </div>
            <div className='flex flex-col flex-1'>
              <div className='flex flex-row w-full overflow-hidden relative h-40 rounded rounded-md border border-zinc-700 drop-shadow-lg bg-slate-950'
                 style={{ borderTopColor: "#ff04c7", borderLeftColor: "#ff04c7" }}
       > 
        <div
                  ref={sonoRef}
                  style={{ willChange: "transform", marginLeft: "0px", width: `${sonoWidth.current}px` }}
                  className='contrast-200 absolute left-1/2'
                >
                  <img
                    ref={imageSonoRef}
                    src={imageSonoEqBlob}
                    className='w-full absolute'
                    style={{ height: "156px" }}
                    alt=''
                  />
                  <img
                    src={imageSonoUeBlob}
                    className='w-full absolute opacity-40'
                    style={{ height: "156px" }}
                    alt=''
                  />
                </div>
                <div
                  className='opacity-20 h-64 w-4 border-l-2 object-none object-contain max-w-none absolute left-1/2 border-white'
                  style={{ marginLeft: "-1px" }}
                ></div>
                <div
                  className='opacity-20 h-64 w-4 border-l-2 object-none object-contain max-w-none absolute left-1/2 border-white'
                  style={{ marginLeft: "2px" }}
                ></div>
                <p
                  className='font-mono font-semibold bg-white ml-1 absolute left-1/2 text-zinc-100 flex'
                  style={{
                    padding: "0px 4px 0px 4px",
                    fontSize: "10px",
                    backgroundColor: isRecording ? "#dc2626" : "rgba(255, 255, 255, 0.2)"
                  }}
                >
                  {formatTime(displayTime)}
                </p>
              </div>
            </div>
          </div>
          <div className='mr-2 flex flex-col'>
            <div
              ref={containerRef}
              className='mt-1 border-bottom rounded-b border-zinc-300 w-full relative h-12 overflow-hidden bg-white cursor-pointer flex-col'
              style={{ borderColor: "#ff04c7", borderBottomColor: "#ff04c7", borderRightColor: "#ff04c7" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <img src={imageWaveBlob} style={{ width: "100%", height: "28px", marginTop: "11px" }} alt='' />
              <div
                ref={progressBarRef}
                className='w-full cursor-col-resize absolute h-full border-r-2 bg-white opacity-80 top-0 left-0'
                style={{ transformOrigin: "left", willChange: "transform", borderColor: "#ff04c7" }}
              ></div>
            </div>
            <div className='flex-col '>
              <div className='flex-row flex'>
                <div className='h-10 w-3/4 mt-2 mb-2 p-4 bg-gray-50'>
                  <div>
                    <Range
                      step={1}
                      min={20000}
                      max={80000}
                      values={sampleRateVal}
                      onChange={(values) => {
                        console.log(values[0]);
                        sampleRate.current = values[0];
                        setSampleRateVal(values);
                      }}
                      renderTrack={({ props, children }) => (
                        <div
                          {...props}
                          className='h-2 bg-slate-200 rounded shadow'
                          style={{
                            ...props.style
                          }}
                        >
                          {children}
                        </div>
                      )}
                      renderThumb={({ props }) => (
                        <div {...props} className='w-3 h-3 bg-zinc-500 rounded-full focus:outline-none' />
                      )}
                    />
                  </div>
                </div>
                <div className='h-10 w-1/4 mt-2 mb-2 p-2 bg-white drop-shadow flex'>
                  <div className='font-semibold text-xs'>
                    <p>
                      {sampleRate.current == 48000 ? (
                        <p className='text-gray-400'>Speed</p>
                      ) : (
                        <div
                          onClick={() => {
                            sampleRate.current = 48000;
                            setSampleRateVal([48000]);
                          }}
                          className='cursor-pointer'
                        >
                          <span className='ml-2 text-red-500 mt-1 mr-2 underline font-extrabold'>Reset</span>
                        </div>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className='flex flex-row'>
                <div className='flex flex-col w-full'>
                  <div className='h-16 mb-1 bg-zinc-50 drop-shadow-md' ref={zoomWaveRef}></div>
                </div>
              </div>
              <div
                className='-mt-8 -ml-6 h-12 w-16 border border-8 border-zinc-100 relative cursor-pointer left-1/2'
                onClick={togglePlaying}
              >
                {isStopped ? (
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 24 24'
                    fill='#ff04c7'
                    className='w-12 h-12 bg-white p-2'
                  >
                    <path
                      fillRule='evenodd'
                      d='M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z'
                      clipRule='evenodd'
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 24 24'
                    fill='#ff04c7'
                    className='w-12 h-12 p-2 bg-white'
                  >
                    <path
                      fillRule='evenodd'
                      d='M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z'
                      clipRule='evenodd'
                    />
                  </svg>
                )}
              </div>

              <div className='w-full flex-col'>
                <h3 className='font-semibold font-mono text-xs mt-2 mb-2 underline'>Clips</h3>

                {draftClips.length == 0 ? (
                  <div className='w-3/5 bg-pink-100 p-2 rounded rounded-md text-sm'>
                    <p>
                      To capture a clip, play the track and press the '<span className='font-extrabold'>c</span>' key to
                      start and again to end. To make adjustments, interact with the segments in the timeline above.
                    </p>
                  </div>
                ) : (
                  <table className='table-auto'>
                    <thead>
                      <tr>
                        <th className='px-4 py-2 text-gray-600'>Start</th>
                        <th className='px-4 py-2 text-gray-600'>End</th>
                        <th className='px-4 py-2 text-gray-600'>Duration</th>
                        <th className='px-4 py-2 text-gray-600'>Sample Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftClips.map((item, index) => (
                        <tr key={index} className='bg-white rounded mb-2'>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 underline cursor-pointer'
                            onClick={() => peaksInstance.current.player.seek(item.startTime)}
                          >
                            {formatTime(item.startTime * 1000, 5)}
                          </td>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 underline cursor-pointer'
                            onClick={() => peaksInstance.current.player.seek(item.endTime)}
                          >
                            {formatTime(item.endTime * 1000, 5)}
                          </td>

                          <td className='px-4 py-2 border-b-2 border-gray-200'>
                            {formatTime((item.endTime - item.startTime) * 1000, true)}
                          </td>
                          <td className='px-4 py-2 border-b-2 border-gray-200'>{sampleRate.current}</td>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 cursor-pointer underline'
                            onClick={() => {
                              playAt(item.startTime, item.endTime);
                            }}
                          >
                            Play
                          </td>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 cursor-pointer underline font-semibold'
                            onClick={() => {
                              createClips([item], sampleRate.current);
                            }}
                          >
                            Save
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {clips.length == 0 ? (
                  <></>
                ) : (
                  <table className='mt-4 table-auto'>
                    <thead>
                      <tr>
                        <th></th>
                        <th className='px-4 py-2 text-gray-600'>Start</th>
                        <th className='px-4 py-2 text-gray-600'>End</th>
                        <th className='px-4 py-2 text-gray-600'>Duration</th>
                        <th className='px-4 py-2 text-gray-600'>Sample Rate</th>
                        <th className='px-4 py-2 text-gray-600'>key</th>
                        <th className='px-4 py-2 text-gray-600'>Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clips.map((item, index) => (
                        <tr key={index} className='bg-white rounded mb-2'>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 cursor-pointer underline'
                            onClick={() => {
                              playAtFrame(item.start, item.end);
                            }}
                          >
                            Play
                          </td>

                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 underline cursor-pointer'
                            onClick={() => peaksInstance.current.player.seek(frameToSeconds(item.start))}
                          >
                            {formatTime(frameToSeconds(item.start) * 1000, 5)}
                          </td>
                          <td
                            className='px-4 py-2 border-b-2 border-gray-200 underline cursor-pointer'
                            onClick={() => peaksInstance.current.player.seek(frameToSeconds(item.end))}
                          >
                            {formatTime(frameToSeconds(item.end) * 1000, 5)}
                          </td>

                          <td className='px-4 py-2 border-b-2 border-gray-200'>
                            {formatTime((frameToSeconds(item.end) - frameToSeconds(item.start)) * 1000, 5)}
                          </td>
                          <td className='px-4 py-2 border-b-2 border-gray-200'>{item.hz}</td>
                          <td className='px-4 py-2 border-b-2 border-gray-200'>{item.key}</td>
                          <td className='px-4 py-2 border-b-2 border-gray-200'>Soical login required</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

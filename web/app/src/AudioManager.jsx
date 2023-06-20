export const AudioManager = () => {
  let audioCtx;
  let mixer;
  let nSources = 2;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  }
  
  function getMixer() {
    if (!mixer) mixer = getAudioCtx().createGain();
    mixer.connect(getAudioCtx().destination);
    return mixer;
  }

  return {
    setNumSources: (i) => {
      nSources = i;
    },
    currentTime: () => getAudioCtx().currentTime,
    play: (channelData, sampleRate, t, cb) => {
      const buffer = getAudioCtx().createBuffer(2, channelData[0].length, sampleRate);
      for (let i = 0; i < channelData.length; i++) {
        buffer.copyToChannel(channelData[i], i, 0);
      }
      const sourceNode = getAudioCtx().createBufferSource();
      sourceNode.buffer = buffer;
      const gainNode = getAudioCtx().createGain();
      gainNode.gain.value = 1.0 / 20//nSources;

      sourceNode.connect(gainNode);
      gainNode.connect(getMixer());

      sourceNode.start(t);

      sourceNode.onended = () => {
        if (cb) cb();
        sourceNode.disconnect();
        gainNode.disconnect();
      }
    }
  }
}

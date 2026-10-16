import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { Film, Poster } from './scenes.jsx';

const Root = () => (
  <>
    <Composition
      id="CardroveTour"
      component={Film}
      durationInFrames={1200}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="CardrovePoster"
      component={Poster}
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
registerRoot(Root);

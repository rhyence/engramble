import { Composition } from 'remotion';
import { EngrambleDemo } from './EngrambleDemo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="EngrambleDemo"
      component={EngrambleDemo}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

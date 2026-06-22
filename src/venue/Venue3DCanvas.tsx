'use client'

// SSR off + lazy-loaded: three.js touches WebGL constants at import time, so
// keep the whole 3D bundle out of the server graph and only ship it when the
// user actually switches to 3D mode.
import dynamic from 'next/dynamic'
import Venue3DLoading from './Venue3DLoading'

const Venue3DCanvas = dynamic(() => import('./Venue3DCanvas.client'), {
  ssr: false,
  loading: () => <Venue3DLoading />,
})

export default Venue3DCanvas

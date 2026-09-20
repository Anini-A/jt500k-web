import 'react'

// <selectedcontent> is part of the customizable-select feature (Safari 27+). It
// mirrors the chosen <option>'s markup into the closed control. React's JSX types
// don't know it yet, so declare it here rather than casting at each call site.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      selectedcontent: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

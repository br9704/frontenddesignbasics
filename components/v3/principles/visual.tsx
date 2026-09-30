import { Card, Chapter, nng } from './b-kit';
import { AccentStill, ContrastStill, CornersStill, DepthStill, SpaceStill, SquintStill, TypeScaleStill } from './b-visual';

const S = {
  hierarchy: nng('visual-hierarchy-ux-definition', 'nngroup · visual hierarchy'),
  scale: { href: 'https://typescale.com/', label: 'typescale.com' },
  colour: nng('color-enhance-design', 'nngroup · colour'),
  contrast: { href: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', label: 'WCAG 2.2 · contrast' },
  proximity: nng('gestalt-proximity', 'nngroup · proximity'),
  elevation: { href: 'https://m3.material.io/styles/elevation/overview', label: 'material 3 · elevation' },
  corners: { href: 'https://m3.material.io/styles/shape/corner-radius-scale', label: 'material 3 · corner radius' },
};

export function VisualChapter() {
  return (
    <Chapter
      id="visual"
      intro="The rules I check before any motion goes in. Each one is a still you can read in a second. If a page fails these, no animation will save it."
    >
      <Card code="V1" rule="I give each view one big thing." why="If everything is loud, nothing is. One clear lead tells people where to start." source={S.hierarchy}>
        <SquintStill />
      </Card>
      <Card
        code="V2"
        rule="I set type from a scale, sized for reading."
        why="A fixed ratio keeps sizes related, and a capped line length keeps reading easy."
        source={S.scale}
      >
        <TypeScaleStill />
      </Card>
      <Card
        code="V3"
        rule="I keep it mostly neutral with one accent."
        why="An accent only works if it's rare. Spend it on the one thing you want pressed."
        source={S.colour}
      >
        <AccentStill />
      </Card>
      <Card
        code="V4"
        rule="I measure contrast, I don't guess it."
        why="Screens and eyes differ. The ratio doesn't, so it's the one I trust."
        source={S.contrast}
      >
        <ContrastStill />
      </Card>
      <Card code="V5" rule="I use space to group things." why="Things close together read as one. Less space inside a group than between groups does the grouping for free." source={S.proximity}>
        <SpaceStill />
      </Card>
      <Card code="V6" rule="I use depth to show what floats." why="Shadow and a lighter surface say this sits above the page, so people know what they can dismiss." source={S.elevation}>
        <DepthStill />
      </Card>
      <Card
        code="V7"
        rule="I keep corners concentric and radii few."
        why="A nested corner looks right when the outer radius equals the inner one plus the padding."
        source={S.corners}
      >
        <CornersStill />
      </Card>
    </Chapter>
  );
}

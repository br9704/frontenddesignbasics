import { Card, Chapter, nng } from './b-kit';
import { AffordanceDemo, EmptyErrorDemo, FeedbackDemo, NielsenDemo, OptimisticDemo, SkeletonDemo } from './b-states';

export function StatesChapter() {
  return (
    <Chapter
      id="states"
      intro="A screen is never just its happy path. It is also loading, empty, broken and waiting for you. These are the checks I run on every state, starting with Nielsen’s ten heuristics: rules of thumb for spotting usability problems."
    >
      <Card
        code="H1"
        rule="I audit every screen against Nielsen's ten."
        why="Ten plain questions catch most problems before anyone tests the screen. Fix the dialog and watch the score."
        source={nng('ten-usability-heuristics', 'nngroup · 10 heuristics')}
      >
        <NielsenDemo />
      </Card>
      <Card
        code="H2"
        rule="I give every press feedback."
        why="If nothing moves, people press again. A pressed state, a busy state and a done state stop the double order."
        source={nng('response-times-3-important-limits', 'nngroup · response times')}
      >
        <FeedbackDemo />
      </Card>
      <Card
        code="H3"
        rule="I make things look like what they do."
        why="An affordance is a hint about what a thing does. If it looks clickable, it should click, and the other way round."
        source={nng('clickable-elements', 'nngroup · clickable elements')}
      >
        <AffordanceDemo />
      </Card>
      <Card
        code="H4"
        rule="I use skeletons, not spinners."
        why="A skeleton shows the shape of what's coming, so the page feels closer to done."
        source={nng('skeleton-screens', 'nngroup · skeleton screens')}
      >
        <SkeletonDemo />
      </Card>
      <Card
        code="H5"
        rule="I design empty and error states as real screens."
        why="An empty screen is the first thing new people see. An error should say what happened, what to do, and keep what they typed."
        source={nng('empty-state-interface-design', 'nngroup · empty states')}
      >
        <EmptyErrorDemo />
      </Card>
      <Card
        code="H6"
        rule="I make it feel fast first (optimistic UI)."
        why="Optimistic means I show the result before the server confirms, then own up if it fails. Most saves succeed, so most waits vanish."
        source={{ href: 'https://www.smashingmagazine.com/2016/11/true-lies-of-optimistic-user-interfaces/', label: 'smashing · optimistic UI' }}
      >
        <OptimisticDemo />
      </Card>
    </Chapter>
  );
}

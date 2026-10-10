import { useState } from 'react';

function CounterButton() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}

export default function App() {
  return (
    <main>
      <h1>Saif's React practice</h1>
      <CounterButton />
    </main>
  );
}

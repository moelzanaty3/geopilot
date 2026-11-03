import { useNavigate } from '@remix-run/react';
export const meta = () => [{ title: 'Atlas: roadmaps for product teams' }, { name: 'description', content: 'Plan, share and track product roadmaps.' }, { tagName: 'link', rel: 'canonical', href: 'https://atlasroadmaps.example/' }];
export default function Home() {
  const navigate = useNavigate();
  return (
    <main>
      <h1>Roadmaps your whole team can follow</h1>
      <p>Integrates with all the tools you already use.</p>
      <div onClick={() => navigate('/features')}>See all features</div>
    </main>
  );
}

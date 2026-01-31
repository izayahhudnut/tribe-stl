
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X,
  History,
  ChevronRight,
  MapPin,
  User,
  Instagram,
  Users,
  Camera,
  Sparkles,
  ArrowLeft,
  MessageCircle,
  Star,
  Share2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import appleMapsLogo from './applemaps.png';
import googleMapsLogo from './googleimages.png';
import { extractFrames } from './utils/videoProcessor';
import { extractVideoPlaceList, matchPlacesToDatabase, getRecommendedPlaces, chatWithPlaceAssistant } from './services/geminiService';
import { STL_DATABASE_TITLES, Place } from './services/database';
import { ProcessingState, UserProfile } from './types';
import { supabase } from './services/supabaseClient';

const STL_NEIGHBORHOODS = [
  { name: "Soulard", description: "Historic brick streets, blues bars, and the famous Soulard Market." },
  { name: "The Hill", description: "St. Louis' Italian enclave with legendary bakeries and trattorias." },
  { name: "Central West End", description: "Tree-lined avenues, the park, and a lively restaurant scene." },
  { name: "Tower Grove South", description: "Colorful homes, indie cafes, and easy access to Tower Grove Park." },
  { name: "Lafayette Square", description: "Victorian architecture, pocket parks, and cozy dining." },
  { name: "Benton Park", description: "A calm residential pocket near lively bars and breweries." },
  { name: "Forest Park Southeast", description: "The Grove’s nightlife and creative energy." },
  { name: "Skinker DeBaliviere", description: "Calm streets, historic homes, and quick access to Forest Park." },
  { name: "Downtown", description: "Stadiums, museums, and city skyline energy." },
  { name: "Dogtown", description: "Neighborhood pubs, Irish roots, and parkside living." },
  { name: "Shaw", description: "Tree-lined blocks and botanical garden proximity." },
  { name: "Compton Heights", description: "Grand historic homes and quiet, hilly streets." },
  { name: "Carondelet", description: "Riverfront history and a strong neighborhood feel." },
  { name: "Old North", description: "Community-driven revitalization with local markets and art." },
  { name: "Grand Center", description: "The arts district with theaters, galleries, and museums." },
  { name: "Lindenwood Park", description: "Classic bungalows and family-friendly vibes." },
  { name: "St. Louis Hills", description: "Spacious parks, classic homes, and calm streets." },
  { name: "North Midtown", description: "Historic structures and close-to-downtown access." },
  { name: "Cherokee Street", description: "Vintage shops, murals, and diverse eats." },
  { name: "Botanical Heights", description: "Small neighborhood charm by the gardens." },
  { name: "Gravois Park", description: "An eclectic mix of homes and local businesses." },
  { name: "Fox Park", description: "Architectural gems and a tight-knit community." },
  { name: "McRee Town", description: "Grassroots neighborhood energy and community projects." }
];

type AppView = 'landing' | 'profile' | 'choice' | 'processing' | 'results' | 'profileDetail';
type ActiveTab = 'places' | 'people' | 'chat';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    age: '',
    photo: null,
    places: []
  });

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rawVideoPlaces, setRawVideoPlaces] = useState<string[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    status: "Ready",
    progress: 0
  });
  const [currentNeighborhood, setCurrentNeighborhood] = useState(STL_NEIGHBORHOODS[0]);
  const [error, setError] = useState<string | null>(null);
  
  // Results State
  const [matches, setMatches] = useState<UserProfile[]>([]);
  const [recommendations, setRecommendations] = useState<(Place & { reason: string })[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('places');
  const [placesView, setPlacesView] = useState<'list' | 'map'>('list');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const mapPinIcon = useMemo(() => {
    return new L.Icon({
      iconRetinaUrl: markerIcon2x,
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  }, []);

  useEffect(() => {
    let interval: number;
    if (processing.isProcessing) {
      interval = window.setInterval(() => {
        const randomIndex = Math.floor(Math.random() * STL_NEIGHBORHOODS.length);
        setCurrentNeighborhood(STL_NEIGHBORHOODS[randomIndex]);
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [processing.isProcessing]);


  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const saveProfile = async () => {
    const age = parseInt(profile.age, 10);
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        name: profile.name,
        age: Number.isNaN(age) ? null : age,
        photo_url: profile.photo
      })
      .select('id')
      .single();

    if (error) {
      setError('Could not save profile. Please try again.');
      return null;
    }

    setProfileId(data.id);
    return data.id as string;
  };

  const savePlaces = async (places: string[], source: 'ai' | 'manual') => {
    const id = profileId ?? (await saveProfile());
    if (!id) return;

    const rows = places.map(place => ({
      profile_id: id,
      place_name: place,
      source
    }));

    const { error } = await supabase.from('profile_places').insert(rows);
    if (error) {
      setError('Could not save places. Please try again.');
    }
  };

  const handleProfileContinue = async () => {
    setError(null);
    const id = await saveProfile();
    if (id) {
      setView('choice');
    }
  };

  const generateResults = async (
    userPlaces: string[],
    extractedListString: string,
    displayPlaces?: string[]
  ) => {
    setProfile(prev => ({ ...prev, places: displayPlaces ?? userPlaces }));
    setView('results');
    setIsGenerating(true);

    // 1. Find matching users (old logic)
    const storedUsersJson = localStorage.getItem('stl_tribe_users');
    const storedUsers: UserProfile[] = storedUsersJson ? JSON.parse(storedUsersJson) : [];
    
    const results = storedUsers
      .filter(u => u.name !== profile.name)
      .map(other => {
        const shared = other.places.filter(p => userPlaces.includes(p));
        const ageDiff = Math.abs(parseInt(other.age) - parseInt(profile.age));
        const score = (shared.length * 25) - (ageDiff * 2);
        return { user: other, score, shared };
      })
      .filter(m => m.shared.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(m => m.user);
    setMatches(results);

    // 2. Save new user
    const newUser: UserProfile = { ...profile, places: userPlaces };
    localStorage.setItem('stl_tribe_users', JSON.stringify([...storedUsers, newUser]));

    // 3. Get AI recommendations
    try {
      const recommended = await getRecommendedPlaces(extractedListString, userPlaces);
      setRecommendations(recommended);
    } catch (err) {
      console.error("Failed to get recommendations", err);
      setError("Could not generate recommendations. Please try again later.");
    } finally {
      setIsGenerating(false);
    }
  };


  const startAnalysis = async () => {
    if (!videoFile) return;
    setView('processing');
    setProcessing({ isProcessing: true, status: "SCANNING", progress: 10 });

    try {
      const frames = await extractFrames(videoFile, 12);
      setProcessing({ isProcessing: true, status: "IDENTIFYING", progress: 50 });
      
      const rawPlaces = await extractVideoPlaceList(frames);
      setRawVideoPlaces(rawPlaces);
      const extractedListString = rawPlaces.join(', ');

      if (rawPlaces.length === 0) {
        setError("No St. Louis landmarks identified. Try manual selection.");
        setView('choice');
        setProcessing({ isProcessing: false, status: "None Found", progress: 0 });
        return;
      }

      const extractedPlaces = await matchPlacesToDatabase(rawPlaces);
      
      if (extractedPlaces.length === 0) {
        setError("No matching database places found. Try manual selection.");
        setView('choice');
        setProcessing({ isProcessing: false, status: "None Found", progress: 0 });
        return;
      }

      setProcessing({ isProcessing: true, status: "MATCHING", progress: 75 });
      await savePlaces(extractedPlaces, 'ai');
      await generateResults(extractedPlaces, extractedListString, extractedPlaces);
      setProcessing({ isProcessing: false, status: "Complete", progress: 100 });
    } catch (err: any) {
      console.error(err);
      setError("Analysis failed. Use manual entry.");
      setProcessing({ isProcessing: false, status: "Error", progress: 0 });
      setView('choice');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Tribe STL',
          text: `Check out my St. Louis vibe! I'm an Urban Explorer on Tribe STL.`,
          url: window.location.href,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard.');
        return;
      }

      alert('Share feature is not supported on your browser.');
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const reset = () => {
    setView('landing');
    setProfile({ name: '', age: '', photo: null, places: [] });
    setVideoFile(null);
    setVideoUrl(null);
    setError(null);
    setMatches([]);
    setRecommendations([]);
    setActiveTab('places');
    setProfileId(null);
    setPlacesView('list');
    setRawVideoPlaces([]);
    setChatMessages([]);
    setChatInput('');
  };

  const handleSendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: trimmed }];
    setChatMessages(nextMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const reply = await chatWithPlaceAssistant(profile.places, trimmed);
      setChatMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages([
        ...nextMessages,
        { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const parseCoordinates = (value: string) => {
    const matches = value.match(/-?\d+\.\d+/g);
    if (!matches || matches.length < 2) return null;
    const lat = Number(matches[0]);
    const lng = Number(matches[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  };

  const recommendationMarkers = useMemo(() => {
    return recommendations
      .map(place => {
        const coords = parseCoordinates(place.coordinates || '');
        if (!coords) return null;
        return { place, coords };
      })
      .filter((item): item is { place: Place & { reason: string }; coords: { lat: number; lng: number } } => item !== null);
  }, [recommendations]);

  const TabButton: React.FC<{tab: ActiveTab, label: string, icon: React.ReactNode}> = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold tracking-widest uppercase border-b-2 transition-all duration-300 ${activeTab === tab ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col text-neutral-900 selection:bg-black selection:text-white">
      
      <main className="flex-1 w-full max-w-lg mx-auto flex flex-col relative min-h-0">
        
        {/* LANDING PAGE */}
        {view === 'landing' && (
           <div className="relative flex-1 flex flex-col p-8 pt-12 animate-in fade-in duration-700 overflow-hidden">
             <div className="absolute inset-0 pointer-events-none">
                <div 
                    className="shooting-star" 
                    style={{ top: '20%', animationDuration: '4s', animationDelay: '0s' }}>
                </div>
                <div 
                    className="shooting-star" 
                    style={{ top: '50%', animationDuration: '4s', animationDelay: '1.8s' }}>
                </div>
                <div 
                    className="shooting-star" 
                    style={{ top: '80%', animationDuration: '4s', animationDelay: '3.2s' }}>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center z-10">
              
              <div className="group relative w-96 h-80 mb-8 flex justify-center items-center">
                  <img 
                      src="https://www.parium.org/_next/image?url=%2Fpyramid.jpeg&w=3840&q=75" 
                      alt="St. Louis Pyramid building"
                      className="absolute w-48 h-64 object-cover rounded-xl border-4 border-white shadow-lg transform -translate-x-16 -rotate-12 transition-transform duration-500 ease-in-out group-hover:-translate-x-24 group-hover:-rotate-20 group-hover:-translate-y-2"
                  />
                  <img 
                      src="https://www.parium.org/_next/image?url=%2Fclayton.jpeg&w=3840&q=75" 
                      alt="Clayton, St. Louis"
                      className="absolute w-48 h-64 object-cover rounded-xl border-4 border-white shadow-lg transform translate-x-16 rotate-12 transition-transform duration-500 ease-in-out group-hover:translate-x-24 group-hover:rotate-20 group-hover:-translate-y-2"
                  />
                  <img 
                      src="https://www.parium.org/_next/image?url=%2Fskyline.jpeg&w=3840&q=75" 
                      alt="St. Louis skyline"
                      className="absolute w-48 h-64 object-cover rounded-xl border-4 border-white shadow-xl z-10 transition-transform duration-500 ease-in-out group-hover:scale-110 group-hover:translate-y-2"
                  />
              </div>

              <h1 className="text-6xl font-bold tracking-tight mb-3">
                <span className="bg-gradient-to-r from-neutral-900 via-red-500 to-orange-400 bg-clip-text text-transparent">
                  Tribe STL
                </span>
              </h1>
              <p className="text-neutral-500 text-base tracking-wide leading-relaxed max-w-sm">
                Upload your most visited places and we'll recommend places and people who match your vibe.
              </p>
            </div>
            
            <div className="pt-8 z-10">
                <button 
                onClick={() => setView('profile')}
                className="group flex items-center justify-center gap-3 bg-black text-white w-full py-4 rounded-full font-semibold tracking-widest text-sm transition-all hover:bg-neutral-800 active:scale-95 shadow-lg shadow-black/10"
                >
                Get Started
                <ChevronRight className="w-4 h-4" />
                </button>
            </div>
          </div>
        )}

        {/* PROFILE CREATION */}
        {view === 'profile' && (
          <div className="flex-1 p-8 pt-12 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-10">
              <button onClick={() => setView('landing')} className="text-neutral-400 hover:text-black transition-colors flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs font-semibold tracking-widest uppercase">Back</span>
              </button>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-neutral-900 via-red-500 to-orange-400 bg-clip-text text-transparent">
                  Tribe STL
                </span>
              </h1>
            </div>

            <h2 className="text-4xl font-bold tracking-tight mb-10">Your Profile</h2>
            
            <div className="space-y-8">
              <div className="flex justify-center mb-4">
                <button 
                  onClick={() => photoInputRef.current?.click()}
                  className="w-24 h-24 rounded-full border border-dashed border-neutral-300 flex flex-col items-center justify-center overflow-hidden hover:border-black transition-colors bg-neutral-50"
                >
                  {profile.photo ? (
                    <img src={profile.photo} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-neutral-400 mb-2" />
                      <span className="text-xs font-semibold text-neutral-500 tracking-widest uppercase">Photo</span>
                    </>
                  )}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-500 tracking-widest uppercase ml-1">Name</label>
                  <input 
                    type="text" 
                    placeholder="Jane Doe"
                    className="w-full bg-neutral-100 border border-transparent rounded-lg p-4 outline-none focus:border-black transition-all font-medium text-sm"
                    value={profile.name}
                    onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-500 tracking-widest uppercase ml-1">Age</label>
                  <input 
                    type="number" 
                    placeholder="00"
                    className="w-full bg-neutral-100 border border-transparent rounded-lg p-4 outline-none focus:border-black transition-all font-medium text-sm"
                    value={profile.age}
                    onChange={(e) => setProfile(p => ({ ...p, age: e.target.value }))}
                  />
                </div>
              </div>

              <button 
                disabled={!profile.name || !profile.age}
                onClick={handleProfileContinue}
                className="w-full bg-black text-white py-5 rounded-lg font-semibold tracking-widest text-sm disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* CHOICE: VIDEO VS MANUAL */}
        {view === 'choice' && (
          <div className="flex-1 p-8 pt-12 animate-in slide-in-from-right-4 duration-500">
             <div className="flex justify-between items-center mb-10">
                <button onClick={() => setView('profile')} className="text-neutral-400 hover:text-black transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-xs font-semibold tracking-widest uppercase">Back</span>
                </button>
                <h1 className="text-xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-neutral-900 via-red-500 to-orange-400 bg-clip-text text-transparent">
                    Tribe STL
                    </span>
                </h1>
            </div>
            
            <h2 className="text-4xl font-bold tracking-tight mb-10">Entry Mode</h2>
            
            <div className="grid gap-6">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="group p-6 bg-neutral-50 border border-neutral-200 rounded-xl text-left transition-all hover:bg-neutral-100 hover:border-black"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <img src={appleMapsLogo} alt="Apple Maps" className="w-5 h-5 object-contain" />
                      <img src={googleMapsLogo} alt="Google Maps" className="w-5 h-5 object-contain" />
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight mb-1">Maps App</h3>
                <p className="text-neutral-500 text-sm tracking-wide leading-relaxed">
                  Extract matches from your map history video.
                </p>
                 <p className="text-neutral-400 text-xs mt-2 tracking-wide leading-relaxed">
                  <span className="font-semibold">How to:</span> On Apple Maps, tap your profile picture &gt; Places &gt; Most Visited, then screen record the list.
                </p>
                {videoFile && (
                  <div className="mt-4 flex items-center gap-2 text-black text-xs font-semibold tracking-widest">
                    <CheckCircle2 className="w-4 h-4" /> {videoFile.name}
                  </div>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            </div>

            {videoFile && (
              <button 
                onClick={startAnalysis}
                className="mt-12 w-full bg-black text-white py-5 rounded-lg font-semibold tracking-widest text-sm transition-all active:scale-[0.98]"
              >
                Analyze
              </button>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-800 text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* PROCESSING SCREEN */}
        {view === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white">
            <div className="w-full text-center">
              <div className="mb-12 relative flex justify-center">
                <Loader2 className="w-20 h-20 text-black animate-spin" style={{ strokeWidth: 1 }} />
              </div>

              <div className="mt-2">
                <div className="h-7 overflow-hidden">
                  <p className="text-lg font-semibold text-neutral-900 tracking-wide">
                    {currentNeighborhood.name}
                  </p>
                </div>
                <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
                  {currentNeighborhood.description || 'Exploring the city...'}
                </p>
              </div>
            </div>
          </div>
        )}


        {/* RESULTS SCREEN */}
        {view === 'results' && (
          <div className="flex-1 flex flex-col p-8 pt-12 animate-in fade-in duration-700 min-h-0">
            <div className="flex justify-end items-center mb-6 relative">
                <h1 className="text-xl font-bold tracking-tight absolute left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-neutral-900 via-red-500 to-orange-400 bg-clip-text text-transparent">
                        Tribe STL
                    </span>
                </h1>
                <button onClick={reset} className="p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors">
                    <X className="w-5 h-5 text-neutral-600" />
                </button>
            </div>

            {/* Archetype Section */}
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-neutral-100 rounded-full mx-auto flex items-center justify-center mb-4 border border-neutral-200">
                <Sparkles className="w-12 h-12 text-black" strokeWidth={1.5} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">The Urban Explorer</h2>
              <p className="text-neutral-500 mt-2 max-w-sm mx-auto text-sm leading-relaxed">
                Your vibe is adventurous and cultured. You thrive in dynamic city environments and appreciate both hidden gems and iconic landmarks.
              </p>
            </div>

            {/* Profile & Share Section */}
            <div className="flex justify-center items-center gap-3 mb-8">
              <button onClick={() => setView('profileDetail')} className="flex items-center gap-2 bg-neutral-100 hover:bg-neutral-200 transition-colors pl-2 pr-4 py-2 rounded-full">
                {profile.photo ? (
                    <img src={profile.photo} className="w-6 h-6 rounded-full object-cover" alt="Profile" />
                ) : (
                    <div className="w-6 h-6 bg-neutral-200 rounded-full flex items-center justify-center">
                        <User className="w-3 h-3 text-neutral-500" />
                    </div>
                )}
                <span className="text-xs font-semibold tracking-wide">{profile.name}</span>
              </button>
              <button onClick={handleShare} className="p-3 bg-neutral-100 hover:bg-neutral-200 transition-colors rounded-full">
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs Section */}
            <div className="border-b border-neutral-200">
              <nav className="flex -mb-px space-x-6 justify-center" aria-label="Tabs">
                <TabButton tab="places" label="Places" icon={<Star className="w-4 h-4" />} />
                <TabButton tab="chat" label="AI Chat" icon={<MessageCircle className="w-4 h-4" />} />
                <TabButton tab="people" label="People" icon={<Users className="w-4 h-4" />} />
              </nav>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto py-6 min-h-0">
              {activeTab === 'places' && (
                <div className="min-h-0">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold text-neutral-400 tracking-widest uppercase">View</p>
                    <div className="inline-flex rounded-full bg-neutral-100 p-1">
                      <button
                        onClick={() => setPlacesView('list')}
                        className={`px-3 py-1 text-xs font-semibold tracking-widest uppercase rounded-full transition-colors ${placesView === 'list' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'}`}
                      >
                        List
                      </button>
                      <button
                        onClick={() => setPlacesView('map')}
                        className={`px-3 py-1 text-xs font-semibold tracking-widest uppercase rounded-full transition-colors ${placesView === 'map' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-black'}`}
                      >
                        Map
                      </button>
                    </div>
                  </div>
                  {isGenerating ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="bg-neutral-100 p-5 rounded-lg animate-pulse">
                          <div className="h-5 w-1/2 bg-neutral-200 rounded-md mb-3"></div>
                          <div className="h-4 w-full bg-neutral-200 rounded-md"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    placesView === 'list' ? (
                      <div className="space-y-4 animate-in fade-in duration-500">
                        {recommendations.map((rec, idx) => (
                          <a 
                            key={idx} 
                            href={rec.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group block bg-neutral-50 p-4 rounded-xl border border-neutral-200 hover:bg-neutral-100 hover:border-neutral-300 transition-all"
                          >
                            <div className="flex-1">
                              <h3 className="font-bold text-base tracking-tight">{rec.title}</h3>
                              <p className="text-neutral-500 text-sm mt-1 leading-relaxed">{rec.reason}</p>
                              <div className="flex flex-wrap gap-2 mt-3">
                                {rec.neighborhood.split(',').map(n => n.trim()).slice(0, 1).map(n => (
                                  <span key={n} className="text-[10px] font-bold tracking-wider text-neutral-600 uppercase bg-neutral-200/60 px-2 py-1 rounded">{n}</span>
                                ))}
                                {rec.category.split(',').map(c => c.trim()).slice(0, 1).map(c => (
                                  <span key={c} className="text-[10px] font-bold tracking-wider text-neutral-600 uppercase bg-neutral-200/60 px-2 py-1 rounded">{c}</span>
                                ))}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="animate-in fade-in duration-500">
                        <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-neutral-200">
                          <MapContainer
                            center={[38.6270, -90.1994]}
                            zoom={12}
                            className="h-full w-full"
                            scrollWheelZoom
                          >
                            <TileLayer
                              attribution='&copy; OpenStreetMap contributors'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            {recommendationMarkers.map(({ place, coords }) => (
                              <Marker key={place.title} position={[coords.lat, coords.lng]} icon={mapPinIcon}>
                                <Popup>
                                  <div className="text-sm">
                                    <div className="font-semibold">{place.title}</div>
                                    <div className="text-neutral-600">{place.address}</div>
                                  </div>
                                </Popup>
                              </Marker>
                            ))}
                          </MapContainer>
                        </div>
                        {recommendationMarkers.length === 0 && (
                          <p className="mt-4 text-xs text-neutral-500">No coordinates available for these places yet.</p>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
              {activeTab === 'people' && (
                 <div className="animate-in fade-in duration-500">
                    {isGenerating ? (
                    <div className="space-y-3">
                        {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 bg-neutral-100 rounded-xl animate-pulse">
                            <div className="w-12 h-12 bg-neutral-200 rounded-full"></div>
                            <div className="flex-1 space-y-2">
                            <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
                            <div className="h-3 bg-neutral-200 rounded w-1/4"></div>
                            </div>
                        </div>
                        ))}
                    </div>
                    ) : matches.length > 0 ? (
                    <div className="relative">
                        <div className="space-y-3 filter blur-md pointer-events-none" aria-hidden="true">
                        {matches.map((match) => (
                            <div key={match.name} className="flex items-center gap-4 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                            {match.photo ? (
                                <img src={match.photo} className="w-12 h-12 rounded-full object-cover" alt="Matched user" />
                            ) : (
                                <div className="w-12 h-12 bg-neutral-200 rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-neutral-400" />
                                </div>
                            )}
                            <div className="space-y-2">
                                <div className="h-4 bg-neutral-300 rounded w-32"></div>
                                <div className="h-3 bg-neutral-200 rounded w-20"></div>
                            </div>
                            </div>
                        ))}
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm p-6 text-center rounded-xl">
                        <h3 className="text-2xl font-bold tracking-tight mb-2">Unlock Your Tribe</h3>
                        <p className="text-neutral-600 text-sm mb-6 max-w-xs mx-auto">Pay $5 to see the {matches.length} {matches.length === 1 ? 'person' : 'people'} you matched with.</p>
                        <button className="bg-black text-white py-3 px-8 rounded-full font-semibold tracking-widest text-sm transition-all hover:bg-neutral-800 active:scale-95">
                            Unlock for $5
                        </button>
                        </div>
                    </div>
                    ) : (
                    <div className="text-center py-16 px-6 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                        <Users className="w-10 h-10 text-neutral-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold tracking-tight mb-2">No Matches Yet</h3>
                        <p className="text-neutral-500 text-sm tracking-wide leading-relaxed">
                        We couldn't find anyone with a similar vibe yet. Check back later!
                        </p>
                    </div>
                    )}
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="flex flex-col h-full animate-in fade-in duration-500">
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {chatMessages.length === 0 ? (
                      <div className="text-center py-16 px-6 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                        <MessageCircle className="w-10 h-10 text-neutral-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold tracking-tight mb-2">Ask the City Guide</h3>
                        <p className="text-neutral-500 text-sm tracking-wide leading-relaxed">
                          Ask for recommendations, date ideas, or neighborhood tips.
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'ml-auto bg-black text-white'
                              : 'mr-auto bg-neutral-100 text-neutral-900'
                          }`}
                        >
                          {msg.content}
                        </div>
                      ))
                    )}
                    {isChatLoading && (
                      <div className="mr-auto bg-neutral-100 text-neutral-900 rounded-2xl px-4 py-3 text-sm">
                        Thinking…
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendChat();
                      }}
                      placeholder="Ask about places, vibes, or plans..."
                      className="flex-1 bg-neutral-100 border border-transparent rounded-full px-4 py-3 text-sm outline-none focus:border-black transition-all"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="px-4 py-3 rounded-full bg-black text-white text-sm font-semibold tracking-widest disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* PROFILE DETAIL SCREEN */}
        {view === 'profileDetail' && (
           <div className="flex-1 flex flex-col p-8 pt-12 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
                <button onClick={() => setView('results')} className="text-neutral-400 hover:text-black transition-colors flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs font-semibold tracking-widest uppercase">Back to Results</span>
                </button>
                <h1 className="text-xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-neutral-900 via-red-500 to-orange-400 bg-clip-text text-transparent">
                    Tribe STL
                    </span>
                </h1>
            </div>

            <div className="text-center">
                {profile.photo ? (
                    <img src={profile.photo} className="w-28 h-28 rounded-full object-cover mx-auto mb-4 border-4 border-white shadow-lg" alt="Profile" />
                ) : (
                    <div className="w-28 h-28 bg-neutral-100 rounded-full mx-auto flex items-center justify-center mb-4 border border-neutral-200">
                        <User className="w-12 h-12 text-neutral-400" />
                    </div>
                )}
                <h2 className="text-3xl font-bold tracking-tight">{profile.name}</h2>
                <p className="text-neutral-500 text-lg">{profile.age} years old</p>
            </div>

            <div className="flex-1 overflow-y-auto mt-10 min-h-0">
                <p className="text-xs font-semibold text-neutral-400 tracking-widest uppercase mb-4">Your Places ({profile.places.length})</p>
                <div className="space-y-2">
                    {profile.places.map(place => (
                        <div key={place} className="bg-neutral-50 p-4 rounded-lg border border-neutral-200">
                            <span className="font-medium text-sm">{place}</span>
                        </div>
                    ))}
                </div>
            </div>
         </div>
        )}
      </main>
    </div>
  );
};

export default App;

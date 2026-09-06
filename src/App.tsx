import React, { useState, useEffect } from 'react';
import { LumaSplashScreen } from './components/LumaSplashScreen';
import { LumaLogin } from './components/LumaLogin';
import { LumaRegister } from './components/LumaRegister';
import { Dashboard } from './components/Dashboard';
import { LumaDashboard } from './components/LumaDashboard';
import { Step1AboutYou } from './components/onboarding/Step1AboutYou';
import { Step2YourGoals } from './components/onboarding/Step2YourGoals';
import { Step3Personalize } from './components/onboarding/Step3Personalize';
import { PersonaType, checkOnboardingCompleted } from './services/userService';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export type AppStep = 'splash' | 'login' | 'register' | 'onboarding-step-1' | 'onboarding-step-2' | 'onboarding-step-3' | 'dashboard';

export default function App() {
  const [step, setStep] = useState<AppStep>('splash');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaType | null>(null);

  // Monitor auth state on startup to restore sessions and inspect onboarding status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setStep((currentStep) => {
          if (
            currentStep === 'onboarding-step-1' || 
            currentStep === 'onboarding-step-2' || 
            currentStep === 'onboarding-step-3' || 
            currentStep === 'dashboard'
          ) {
            return 'login';
          }
          return currentStep;
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSplashComplete = () => {
    // After splash, if already authenticated, go directly to dashboard.
    // Otherwise, always show the LOGIN page! Onboarding is NEVER shown on startup.
    let activeUser = auth.currentUser;
    if (!activeUser) {
      try {
        const stored = localStorage.getItem('luma_active_user');
        if (stored) activeUser = JSON.parse(stored);
      } catch (_) {}
    }

    if (activeUser) {
      setCurrentUser(activeUser);
      setStep('dashboard');
    } else {
      setStep('login');
    }
  };

  const handleAuthSuccess = (user: any, isNewRegistration = false) => {
    setCurrentUser(user);
    if (isNewRegistration) {
      // Onboarding is exclusively for brand-new users right after registration & OTP verification
      setStep('onboarding-step-1');
    } else {
      // Existing / old users logging in go straight to dashboard instantly
      setStep('dashboard');
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('luma_active_user');
      // Clear session keys so subsequent login shows daily mood check-in after delay
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('luma_mood_prompted_session_')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (_) {}
    auth.signOut().catch(console.warn);
    setCurrentUser(null);
    setSelectedPersona(null);
    setStep('login');
  };

  return (
    <>
      {step === 'splash' && (
        <LumaSplashScreen onComplete={handleSplashComplete} />
      )}

      {step === 'login' && (
        <LumaLogin
          onLoginSuccess={(user) => handleAuthSuccess(user, false)}
          onNavigateToRegister={() => setStep('register')}
        />
      )}

      {step === 'register' && (
        <LumaRegister
          onRegisterSuccess={(user) => handleAuthSuccess(user, true)}
          onNavigateToLogin={() => setStep('login')}
        />
      )}

      {step === 'onboarding-step-1' && (
        <Step1AboutYou
          onNextStep={(persona) => {
            setSelectedPersona(persona);
            setStep('onboarding-step-2');
          }}
          onSkip={() => setStep('dashboard')}
          onRedirectToLogin={() => setStep('login')}
          onRedirectToDashboard={() => setStep('dashboard')}
        />
      )}

      {step === 'onboarding-step-2' && (
        <Step2YourGoals
          selectedPersona={selectedPersona}
          onPrevStep={() => setStep('onboarding-step-1')}
          onSkip={() => setStep('dashboard')}
          onComplete={() => setStep('onboarding-step-3')}
        />
      )}

      {step === 'onboarding-step-3' && (
        <Step3Personalize
          selectedPersona={selectedPersona}
          onPrevStep={() => setStep('onboarding-step-2')}
          onSkip={() => setStep('dashboard')}
          onComplete={() => setStep('dashboard')}
        />
      )}

      {step === 'dashboard' && (
        <Dashboard
          user={currentUser}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}

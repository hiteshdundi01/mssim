interface OnboardingProps {
    onBuildPortfolio: () => void;
    onUseSample: () => void;
}

export function Onboarding({ onBuildPortfolio, onUseSample }: OnboardingProps) {
    return (
        <div className="onboarding-backdrop">
            <div className="onboarding-content">
                {/* Floating particles decoration */}
                <div className="onboarding-particles">
                    {Array.from({ length: 20 }, (_, i) => (
                        <div
                            key={i}
                            className="onboarding-particle"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 3}s`,
                                animationDuration: `${2 + Math.random() * 3}s`,
                            }}
                        />
                    ))}
                </div>

                <div className="onboarding-badge">MSSIM</div>
                <h1 className="onboarding-title">
                    See how your portfolio survives<br />
                    <span className="onboarding-highlight">a financial crisis</span>
                </h1>
                <p className="onboarding-subtitle">
                    100,000 possible futures, simulated on your GPU in under 1 millisecond.
                    <br />
                    Pick a crisis scenario and watch the outcome distribution come alive.
                </p>

                <div className="onboarding-actions">
                    <button className="onboarding-primary" onClick={onBuildPortfolio}>
                        Build Your Portfolio
                    </button>
                    <button className="onboarding-secondary" onClick={onUseSample}>
                        Use Sample Portfolio (60/30/10)
                    </button>
                </div>

                <div className="onboarding-footnote">
                    Equities 60% · Bonds 30% · Commodities 10%
                </div>
            </div>
        </div>
    );
}

"""
Market correlation enrichment for Deeplitics v1.

Fetches historical stock price data from Yahoo Finance around story publication dates
and calculates price movements to identify potential market correlations.

Usage:
    from enrich_market_data import enrich_all_stories
    stories = enrich_all_stories(stories)
"""

import yfinance as yf
from datetime import datetime, timedelta
import json
import logging

logger = logging.getLogger(__name__)

# Ticker-Mapping: Story-Keywords → Stock Tickers
# Erweitere diese Liste je nach deinen Storys
TICKER_MAPPING = {
    # Gefängnisse & Einwanderung
    "GEO Group": "GEO",
    "geo group": "GEO",
    "CoreCivic": "CXW",
    "corecivic": "CXW",
    "private prison": ["GEO", "CXW"],
    "detention": ["GEO", "CXW"],
    "ICE": ["GEO", "CXW"],
    
    # Verteidigung
    "Raytheon": "RTX",
    "Lockheed Martin": "LMT",
    "Northrop Grumman": "NOC",
    "Boeing": "BA",
    "defense contractor": ["RTX", "LMT", "NOC", "BA"],
    "missile": ["RTX", "LMT", "NOC"],
    
    # Energie/Rohstoffe
    "oil": "CL=F",
    "crude": "CL=F",
    "Russia": "RSX",
    "GAZPROM": "GAZP.ME",  # Nicht auf Yahoo, aber versuchen
    
    # Technologie
    "Tesla": "TSLA",
    "tesla": "TSLA",
    "Apple": "AAPL",
    "apple": "AAPL",
    "Google": "GOOGL",
    "google": "GOOGL",
    "Microsoft": "MSFT",
    "microsoft": "MSFT",
    "Meta": "META",
    "Amazon": "AMZN",
    
    # Pharma/Biotech
    "vaccine": ["JNJ", "PFE", "MRNA"],
    "Pfizer": "PFE",
    "pfizer": "PFE",
    "Moderna": "MRNA",
    "moderna": "MRNA",
    "Johnson & Johnson": "JNJ",
    
    # Regionale ETFs
    "Ukraine": "IYM",  # iShares MSCI Emerging Markets
    "ukraine": "IYM",
    "Taiwan": "EWT",   # iShares MSCI Taiwan ETF
    "taiwan": "EWT",
    "Afghanistan": "IYM",
    "afghanistan": "IYM",
    
    # Finanz-Indizes
    "S&P 500": "^GSPC",
    "sp 500": "^GSPC",
    "nasdaq": "^IXIC",
    "dow": "^DJI",
}

def extract_tickers_from_story(story):
    """
    Extrahiere potenzielle Ticker aus Story-Metadaten und Text.
    
    Args:
        story: Dict mit Story-Daten
        
    Returns:
        Set von eindeutigen Tickers
    """
    tickers = set()
    
    # Suche in Stakeholders (Organisationen)
    if "stakeholders" in story:
        for stakeholder in story.get("stakeholders", []):
            name = stakeholder.get("name", "").lower()
            if name in TICKER_MAPPING:
                ticker_or_list = TICKER_MAPPING[name]
                if isinstance(ticker_or_list, list):
                    tickers.update(ticker_or_list)
                else:
                    tickers.add(ticker_or_list)
    
    # Suche in Title, Summary, Deep Dive
    text_fields = [
        story.get("title", ""),
        story.get("summary", ""),
        story.get("deep_dive", ""),
    ]
    text = " ".join(text_fields).lower()
    
    for keyword, ticker_or_list in TICKER_MAPPING.items():
        if keyword.lower() in text:
            if isinstance(ticker_or_list, list):
                tickers.update(ticker_or_list)
            else:
                tickers.add(ticker_or_list)
    
    return tickers

def fetch_market_data(ticker, pub_date, window_days=15):
    """
    Fetche Preisdaten für einen Ticker um ein Publikationsdatum herum.
    
    Args:
        ticker: z.B. "GEO", "TSLA", "^GSPC"
        pub_date: datetime oder String "YYYY-MM-DD"
        window_days: Tage vor/nach Publikation zu fetchen
        
    Returns:
        pandas DataFrame mit Preisdaten oder None bei Fehler
    """
    try:
        if isinstance(pub_date, str):
            pub_date = datetime.strptime(pub_date, "%Y-%m-%d")
        
        start = (pub_date - timedelta(days=window_days)).strftime('%Y-%m-%d')
        end = (pub_date + timedelta(days=window_days)).strftime('%Y-%m-%d')
        
        # Fetche Daten (progress=False: keine Ausgabe in Terminal)
        data = yf.download(ticker, start=start, end=end, progress=False)
        
        if data.empty:
            logger.warning(f"Keine Daten für {ticker} gefunden")
            return None
        
        return data
    except Exception as e:
        logger.error(f"Fehler beim Fetchen von {ticker}: {e}")
        return None

def calculate_correlation(data, pub_date, ticker):
    """
    Berechne Preisbewegung vor und nach Publikation.
    
    Args:
        data: pandas DataFrame von yfinance (mit 'Close' Spalte)
        pub_date: Publikationsdatum (datetime oder String "YYYY-MM-DD")
        ticker: Ticker-Symbol
        
    Returns:
        Dict mit Korrelationsdaten
    """
    if isinstance(pub_date, str):
        pub_date_str = pub_date
        pub_date = datetime.strptime(pub_date, "%Y-%m-%d")
    else:
        pub_date_str = pub_date.strftime("%Y-%m-%d")
    
    try:
        # Finde Close-Preis am Publikationstag oder davor (Märkte könnten geschlossen sein)
        price_before = None
        price_after_7d = None
        
        # Suche Preis am/vor Publikationstag (bis zu 5 Tage zurück)
        for offset in range(0, 5):
            search_date = (pub_date - timedelta(days=offset)).strftime('%Y-%m-%d')
            if search_date in data.index:
                price_before = data.loc[search_date, 'Close']
                break
        
        # Suche Preis 7 Tage nach Publikation (mit ±1 Tag Toleranz)
        for offset in range(0, 8):
            search_date = (pub_date + timedelta(days=offset + 7)).strftime('%Y-%m-%d')
            if search_date in data.index:
                price_after_7d = data.loc[search_date, 'Close']
                break
        
        if price_before is None or price_after_7d is None:
            return {
                "ticker": ticker,
                "status": "insufficient_data",
                "message": f"Nicht genug Preisdaten für {ticker} um {pub_date_str}"
            }
        
        pct_change = ((price_after_7d - price_before) / price_before) * 100
        
        return {
            "ticker": ticker,
            "status": "ok",
            "pub_date": pub_date_str,
            "price_before": round(float(price_before), 2),
            "price_after_7d": round(float(price_after_7d), 2),
            "pct_change": round(pct_change, 2),
            "correlation_strength": classify_correlation(pct_change),
        }
    except Exception as e:
        logger.error(f"Fehler bei Berechnung für {ticker}: {e}")
        return {
            "ticker": ticker,
            "status": "error",
            "message": str(e)
        }

def classify_correlation(pct_change):
    """
    Klassifiziere Stärke der Preisbewegung.
    
    ≥15% oder ≤-15% = strong
    5–15% oder -5 bis -15% = moderate
    1–5% oder -1 bis -5% = weak
    <1% oder >-1% = none (keine erkennbare Bewegung)
    
    Args:
        pct_change: Prozentuale Preisänderung (positive oder negative)
        
    Returns:
        String: "strong", "moderate", "weak", or "none"
    """
    abs_change = abs(pct_change)
    
    if abs_change >= 15:
        return "strong"
    elif abs_change >= 5:
        return "moderate"
    elif abs_change >= 1:
        return "weak"
    else:
        return "none"

def enrich_story_with_market_data(story):
    """
    Hauptfunktion: Anreichere einzelne Story mit Marktdaten.
    
    Args:
        story: Dict mit Story-Daten (muss 'pub_date' enthalten)
        
    Returns:
        Modifizierte Story mit neuem 'market_impacts' Feld
    """
    pub_date = story.get("pub_date")
    if not pub_date:
        logger.warning(f"Story '{story.get('title', 'Unknown')}' hat kein pub_date")
        story["market_impacts"] = []
        return story
    
    # Extrahiere Tickers
    tickers = extract_tickers_from_story(story)
    
    if not tickers:
        logger.debug(f"Keine Tickers für Story '{story.get('title')}' identifiziert")
        story["market_impacts"] = []
        return story
    
    logger.info(f"Story '{story.get('title')}' — fetche Daten für: {', '.join(sorted(tickers))}")
    
    market_impacts = []
    for ticker in sorted(tickers):
        # Fetche Daten
        data = fetch_market_data(ticker, pub_date, window_days=15)
        
        if data is None:
            market_impacts.append({
                "ticker": ticker,
                "status": "fetch_failed",
                "message": f"Konnte keine Daten für {ticker} abrufen"
            })
            continue
        
        # Berechne Korrelation
        correlation = calculate_correlation(data, pub_date, ticker)
        market_impacts.append(correlation)
    
    story["market_impacts"] = market_impacts
    return story

def enrich_all_stories(stories):
    """
    Anreichere alle Stories in einer Liste mit Marktdaten.
    
    Args:
        stories: List von Story-Dicts
        
    Returns:
        List von angereicherten Story-Dicts
    """
    enriched = []
    for i, story in enumerate(stories, 1):
        logger.info(f"Verarbeite Story {i}/{len(stories)}")
        enriched_story = enrich_story_with_market_data(story)
        enriched.append(enriched_story)
    
    return enriched

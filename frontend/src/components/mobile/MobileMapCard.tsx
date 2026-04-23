import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

interface MobileMapCardProps {
  bagId: string
  latitude: number
  longitude: number
  accuracy?: number
  isReal: boolean
}

function RecenterMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: true })
  }, [latitude, longitude, map])

  return null
}

function MobileMapCard({ bagId, latitude, longitude, accuracy, isReal }: MobileMapCardProps) {
  return (
    <article className="mobile-card mobile-map-card">
      <div className="mobile-map-card-header">
        <div>
          <p className="mobile-card-label">Live Location</p>
          <p className="mobile-map-status-text">
            {isReal ? 'Real-time GPS lock active' : 'GPS unavailable - using fallback'}
          </p>
        </div>

        <div className="mobile-map-badges">
          <span className={`mobile-map-badge ${isReal ? 'mobile-map-badge-live' : 'mobile-map-badge-fallback'}`}>
            {isReal ? 'LIVE' : 'APPROX'}
          </span>
          {isReal && typeof accuracy === 'number' && (
            <span className="mobile-map-badge mobile-map-badge-accuracy">±{Math.round(accuracy)}m</span>
          )}
        </div>
      </div>

      <div className="mobile-map-container">
        <MapContainer
          center={[latitude, longitude]}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <RecenterMap latitude={latitude} longitude={longitude} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[latitude, longitude]}>
            <Popup>
              <strong>{bagId}</strong>
              <br />
              {isReal ? 'Real-time device location' : 'Fallback location'}
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="mobile-map-footer">
        <span className="mobile-map-coordinates">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        <span className="mobile-map-device">{bagId}</span>
      </div>
    </article>
  )
}

export default MobileMapCard

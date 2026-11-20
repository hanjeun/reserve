export default function MarketingPhone({ scene, label }) {
    return <figure className="marketing-device" data-marketing-scroll-stop aria-label={`${label} 시연`}>
        <div className="marketing-phone">
            <div className="marketing-phone-screen">
                <div className="marketing-phone-canvas">
                    <div className="marketing-phone-status" aria-hidden="true">
                        <strong>12:30</strong>
                        <div className="marketing-phone-levels">
                            <img src="/marketing-images/device/cellular.svg" alt="" />
                            <img src="/marketing-images/device/wifi.svg" alt="" />
                            <img src="/marketing-images/device/battery.svg" alt="" />
                        </div>
                    </div>
                    <div className="marketing-phone-content">
                        <iframe className="marketing-phone-webview" title={`${label} 실제 화면 미리보기`}
                            data-service-preview={scene} data-preview-src={`/service-preview/index.html?scene=${scene}`}
                            sandbox="allow-scripts allow-forms" loading="lazy" referrerPolicy="same-origin" width="402" height="780" />
                        <div className="marketing-phone-loading" aria-hidden="true"><span /><span /><span /></div>
                        <div className="marketing-phone-error">
                            <p role="status">미리보기를 불러오지 못했어요.</p>
                            <button type="button" className="reserve-text-link" data-service-preview-retry>다시 불러오기</button>
                        </div>
                    </div>
                    <div className="marketing-phone-home" aria-hidden="true" />
                </div>
            </div>
            <img className="marketing-phone-hardware" src="/marketing-images/device/iphone16-pro.png" alt="" width="450" height="920" decoding="async" aria-hidden="true" />
        </div>
    </figure>;
}

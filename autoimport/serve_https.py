import http.server
import ssl
import socket
import os
import datetime
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

PORT = 8000
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

def get_local_ips():
    ips = ["127.0.0.1", "localhost"]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Socket sin conexion real para resolver IP de red local
        s.connect(("8.8.8.8", 80))
        main_ip = s.getsockname()[0]
        s.close()
        if main_ip not in ips:
            ips.append(main_ip)
    except Exception:
        pass
    return ips

def get_primary_wifi_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None

def verify_ip_in_cert(cert_path, current_ip):
    if not os.path.exists(cert_path) or not current_ip:
        return False
    try:
        with open(cert_path, "rb") as f:
            cert_data = f.read()
        cert = x509.load_pem_x509_certificate(cert_data)
        # Comprobar validez temporal
        if cert.not_valid_after_utc < datetime.datetime.now(datetime.timezone.utc):
            return False
        
        # Comprobar si la IP local actual esta registrada en los Subject Alternative Names (SAN)
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        ips_in_cert = san.value.get_values_for_type(x509.IPAddress)
        for ip in ips_in_cert:
            if str(ip) == current_ip:
                return True
    except Exception:
        pass
    return False

def generate_self_signed_cert(cert_path, key_path):
    print("Generando certificado SSL dinamico y clave privada PEM...")
    
    ips = get_local_ips()
    primary_ip = get_primary_wifi_ip()
    
    # Crear clave RSA
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    
    # Nombre del Emisor y Sujeto
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, u"AutoGerma Local HTTPS"),
    ])
    
    # Construir Certificado (validez 365 dias para compatibilidad iOS estricta)
    now = datetime.datetime.now(datetime.timezone.utc)
    builder = x509.CertificateBuilder()
    builder = builder.subject_name(subject)
    builder = builder.issuer_name(issuer)
    builder = builder.public_key(private_key.public_key())
    builder = builder.serial_number(x509.random_serial_number())
    builder = builder.not_valid_before(now - datetime.timedelta(days=1))
    builder = builder.not_valid_after(now + datetime.timedelta(days=365))
    
    # Registrar SANs (localhost, IPs)
    san_list = [x509.DNSName(u"localhost")]
    for ip in ips:
        if ip != "localhost":
            try:
                san_list.append(x509.IPAddress(socket.inet_aton(ip)))
            except Exception:
                san_list.append(x509.DNSName(ip))
                
    builder = builder.add_extension(
        x509.SubjectAlternativeName(san_list),
        critical=False,
    )
    
    # Añadir Key Usage obligatorio para iOS
    builder = builder.add_extension(
        x509.KeyUsage(
            digital_signature=True,
            content_commitment=False,
            key_encipherment=True,
            data_encipherment=False,
            key_agreement=False,
            key_cert_sign=False,
            crl_sign=False,
            encipher_only=False,
            decipher_only=False
        ),
        critical=True
    )
    
    # Añadir Extended Key Usage (Autenticación de Servidor) obligatorio para iOS Safari
    builder = builder.add_extension(
        x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
        critical=False
    )
    
    # Firmar certificado
    cert = builder.sign(private_key, hashes.SHA256())
    
    # Guardar archivos PEM
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
        
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
    print("Certificados PEM generados con éxito.")

class SafeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Forzar desactivacion de cache para visualizar cambios instantaneamente
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def run_server():
    primary_ip = get_primary_wifi_ip()
    
    # Si la IP ha cambiado o el certificado no existe, se regenera automaticamente
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE) or not verify_ip_in_cert(CERT_FILE, primary_ip):
        if os.path.exists(CERT_FILE):
            os.remove(CERT_FILE)
        if os.path.exists(KEY_FILE):
            os.remove(KEY_FILE)
        generate_self_signed_cert(CERT_FILE, KEY_FILE)
        
    server_address = ("", PORT)
    httpd = http.server.HTTPServer(server_address, SafeHTTPRequestHandler)
    
    # Crear el contexto SSL seguro de forma nativa
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
    
    # Envolver el socket con SSL
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    local_ips = get_local_ips()
    print("=" * 60)
    print("  SERVIDOR WEB SEGURO ACTIVO (HTTPS)")
    print("=" * 60)
    print("Dispositivos locales (tu iPhone/iPad) pueden acceder en:")
    for ip in local_ips:
        if ip != "127.0.0.1" and ip != "localhost":
            print(f"   *  https://{ip}:{PORT}")
    print("\nEste ordenador local puede acceder en:")
    print(f"   *  https://localhost:{PORT}")
    print("=" * 60)
    print("!!! IMPORTANTE (ADVERTENCIA DE SEGURIDAD EN EL MOVIL):")
    print("Al ser un certificado auto-firmado creado localmente en tu casa:")
    print("1. Safari/Chrome mostraran un mensaje de 'Conexion no privada' o 'No segura'.")
    print("2. Pulsa en 'Mostrar detalles' o 'Configuracion avanzada'.")
    print("3. Selecciona 'Acceder a este sitio web' o 'Continuar a la IP (no seguro)'.")
    print("4. Esto es 100% seguro, ya que la comunicacion se realiza solo dentro de tu Wi-Fi.")
    print("=" * 60)
    print("Presiona Ctrl+C para apagar el servidor.")
    print("=" * 60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nApagando el servidor HTTPS de desarrollo de forma segura...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()

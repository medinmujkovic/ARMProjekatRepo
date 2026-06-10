FROM ubuntu:22.04

# Izbjegavanje interaktivnih upita tokom instalacije paketa
ENV DEBIAN_FRONTEND=noninteractive

# 1. Instalacija Apache2 i SSL modula unutar Ubuntu baze
RUN apt-get update && apt-get install -y \
    apache2 \
    && a2enmod ssl \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# 2. Kopiranje konfiguracije virtuelnog hosta (www) u Apache
COPY www.conf /etc/apache2/sites-available/www.conf

# 3. Gašenje defaultne stranice i paljenje našeg virtuelnog hosta
RUN a2dissite 000-default.conf && a2ensite www.conf

# 4. Kopiranje cjelokupnog koda tvoje web aplikacije u Apache direktorij
# Pretpostavljamo da se kod aplikacije nalazi u repozitoriju
COPY . /var/www/html/

# Osiguravamo da pocetna.html radi kao glavna stranica ako zatreba
RUN cp /var/www/html/html/pocetna.html /var/www/html/index.html || true

# Izlaganje portova 80 (HTTP) i 443 (HTTPS) kako traži zadatak
EXPOSE 80 443

# Pokretanje Apache servera u pozadini kontejnera
CMD ["apache2ctl", "-D", "FOREGROUND"]
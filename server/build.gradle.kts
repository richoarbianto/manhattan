plugins {
    java
    id("org.springframework.boot") version "3.4.5"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.manhattan"
version = "0.0.1-SNAPSHOT"

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<JavaCompile> {
    options.release.set(21)
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring Boot starters
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-data-mongodb")

    // Spring Retry for database retry logic
    implementation("org.springframework.retry:spring-retry")
    implementation("org.springframework:spring-aspects")

    // Bouncy Castle for Argon2id server-side verification
    implementation("org.bouncycastle:bcprov-jdk18on:1.80")

    // Testing
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("net.jqwik:jqwik:1.9.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // Testcontainers for integration tests
    testImplementation("org.testcontainers:mongodb:1.19.8")
    testImplementation("org.testcontainers:junit-jupiter:1.19.8")
}

tasks.withType<Test> {
    useJUnitPlatform {
        includeEngines("junit-jupiter", "jqwik")
    }
}
